#!/usr/bin/env python
import argparse
import hashlib
import importlib.metadata
import json
import re
import sys
import unicodedata
from pathlib import Path


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--predictions")
    parser.add_argument("--metadata")
    args = parser.parse_args()

    if not args.input or not args.predictions or not args.metadata:
        parser.error("--input, --predictions and --metadata are required")

    require_nltk_resources()

    try:
        from g2p_en import G2p
        import g2p_en
    except Exception as exc:
        raise RuntimeError(
            "g2p-en is not installed in the active Python environment. "
            "Install once with: conda install -c conda-forge g2p-en -y"
        ) from exc

    prepared = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if prepared.get("schema") != "rhymelab-g2pen-neural-input-v1":
        raise RuntimeError("Expected RhymeLab g2p-en neural input v1")

    engine = G2p()
    package_version = importlib.metadata.version("g2p-en")
    package_dir = Path(g2p_en.__file__).resolve().parent
    checkpoint = package_dir / "checkpoint20.npz"
    if not checkpoint.exists():
        raise RuntimeError(f"Bundled g2p-en checkpoint missing: {checkpoint}")

    rows = []
    for case in prepared.get("cases", []):
        model_input = str(case.get("model_input") or "")
        if not model_input or not re.fullmatch(r"[a-z]+", model_input):
            raise RuntimeError(
                "Invalid RhymeLab-prepared g2p-en model input for "
                + str(case.get("case_id"))
                + ": "
                + model_input
            )
        phones = engine.predict(model_input)
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

    eligible = len(prepared.get("cases", []))
    coverage = round((len(rows) * 100 / eligible), 2) if eligible else 0
    metadata = {
        "schema": "rhymelab-g2pen-neural-benchmark-metadata-v1",
        "candidate": "g2p-en-neural",
        "package": "g2p-en",
        "package_version": package_version,
        "model_id": "checkpoint20.npz",
        "checkpoint_sha256": sha256_file(checkpoint),
        "model_input_eligible": eligible,
        "prediction_rows": len(rows),
        "eligible_prediction_coverage_pct": coverage,
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
