#!/usr/bin/env python
import argparse
import hashlib
import importlib.metadata
import json
import re
import sys
import unicodedata
from pathlib import Path


def prepare_input(value):
    original = str(value or "")
    normalized = unicodedata.normalize("NFKC", original).strip().lower()
    decomposed = unicodedata.normalize("NFKD", normalized)
    folded = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    folded = unicodedata.normalize("NFKC", folded)
    unsupported = sorted(set(ch for ch in folded if not ("a" <= ch <= "z")))
    return {
        "original": original,
        "normalized": normalized,
        "model_input": folded if folded and not unsupported else None,
        "eligible": bool(folded) and not unsupported,
        "strategy": "lowercase_diacritic_fold" if folded != normalized else "lowercase_normalized",
        "unsupported_graphemes": unsupported,
    }


def require_nltk_resources():
    try:
        import nltk
    except Exception as exc:
        raise RuntimeError(
            "g2p-en environment is missing NLTK. Install g2p-en first."
        ) from exc

    missing = []
    for resource in (
        "corpora/cmudict",
        "taggers/averaged_perceptron_tagger",
    ):
        try:
            nltk.data.find(resource)
        except LookupError:
            try:
                nltk.data.find(resource + ".zip")
            except LookupError:
                missing.append(resource)

    if missing:
        raise RuntimeError(
            "Required NLTK resources are missing: "
            + ", ".join(missing)
            + ". Install once with: "
            + "python -m nltk.downloader cmudict averaged_perceptron_tagger"
        )


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def self_test():
    assert prepare_input("Toyota")["model_input"] == "toyota"
    assert prepare_input("Céline")["model_input"] == "celine"
    assert prepare_input("Pokémon")["model_input"] == "pokemon"
    assert prepare_input("O’Connor")["eligible"] is False
    assert prepare_input("Søren")["eligible"] is False
    print("g2p-en benchmark bridge self-test: PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark")
    parser.add_argument("--predictions")
    parser.add_argument("--metadata")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    if not args.benchmark or not args.predictions or not args.metadata:
        parser.error("--benchmark, --predictions and --metadata are required")

    require_nltk_resources()

    try:
        from g2p_en import G2p
        import g2p_en
    except Exception as exc:
        raise RuntimeError(
            "g2p-en is not installed in the active Python environment. "
            "Install once with: conda install -c conda-forge g2p-en -y"
        ) from exc

    benchmark = json.loads(Path(args.benchmark).read_text(encoding="utf-8"))
    if benchmark.get("schema") != "rhymelab-entity-g2p-proper-name-token-benchmark-v2":
        raise RuntimeError("Expected proper-name token benchmark v2")

    engine = G2p()
    package_version = importlib.metadata.version("g2p-en")
    package_dir = Path(g2p_en.__file__).resolve().parent
    checkpoint = package_dir / "checkpoint20.npz"
    if not checkpoint.exists():
        raise RuntimeError(f"Bundled g2p-en checkpoint missing: {checkpoint}")

    rows = []
    ineligible = []
    diacritic_fold_cases = 0
    for case in benchmark.get("cases", []):
        prepared = prepare_input(case.get("normalized") or case.get("surface"))
        if prepared["strategy"] == "lowercase_diacritic_fold":
            diacritic_fold_cases += 1
        if not prepared["eligible"]:
            ineligible.append({
                "case_id": case.get("case_id"),
                "surface": case.get("surface"),
                "unsupported_graphemes": prepared["unsupported_graphemes"],
            })
            continue

        phones = engine.predict(prepared["model_input"])
        pronunciation = " ".join(str(phone) for phone in phones if phone)
        if not pronunciation:
            continue
        rows.append({
            "case_id": case.get("case_id"),
            "notation": "arpabet",
            "pronunciation": pronunciation,
        })

    output = ["case_id\tnotation\tpronunciation"]
    output.extend(
        row["case_id"] + "\t" + row["notation"] + "\t" + row["pronunciation"]
        for row in rows
    )
    Path(args.predictions).parent.mkdir(parents=True, exist_ok=True)
    Path(args.predictions).write_text("\n".join(output) + "\n", encoding="utf-8")

    total = len(benchmark.get("cases", []))
    eligible = total - len(ineligible)
    coverage = round((len(rows) * 100 / eligible), 2) if eligible else 0
    metadata = {
        "schema": "rhymelab-g2pen-neural-benchmark-metadata-v1",
        "candidate": "g2p-en-neural",
        "package": "g2p-en",
        "package_version": package_version,
        "model_id": "checkpoint20.npz",
        "checkpoint_sha256": sha256_file(checkpoint),
        "benchmark_cases": total,
        "model_input_eligible": eligible,
        "model_input_ineligible": len(ineligible),
        "prediction_rows": len(rows),
        "eligible_prediction_coverage_pct": coverage,
        "diacritic_fold_cases": diacritic_fold_cases,
        "ineligible_sample": ineligible[:20],
        "neural_path_forced": True,
        "cmudict_lookup_used": False,
        "homograph_lookup_used": False,
        "pos_lookup_used": False,
    }
    Path(args.metadata).parent.mkdir(parents=True, exist_ok=True)
    Path(args.metadata).write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
