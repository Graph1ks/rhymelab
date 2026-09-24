import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useDocumentWorkspace } from '../library/DocumentWorkspaceProvider';
import { useRuntimeEnvironment } from '../search/data';
import {
  STUDIO_DEVICE_GATES,
  diagnosticsFilename,
  mergeStudioDeviceAcceptanceReports,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceFilename,
  studioDeviceAcceptanceSummary,
  studioDeviceEnvironmentLabel,
  studioDeviceGateEnvironmentStatus,
} from '../../core/system';
import { useUiStore } from '../../state/uiStore';
import {
  currentDeviceEnvironment,
  loadDeviceAcceptance,
  persistDeviceAcceptance,
  reactStudioDiagnostics,
  serializeJsonDownload,
  updateDeviceGate,
} from './model';
import styles from '../../shell/Shell.module.css';

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([serializeJsonDownload(payload)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SystemAcceptancePanel() {
  const language = useUiStore((state) => state.uiLanguage);
  const documents = useDocumentWorkspace();
  const runtime = useRuntimeEnvironment();
  const importRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState(() => loadDeviceAcceptance());
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(
    STUDIO_DEVICE_GATES.map((gate) => [gate.id, report.results?.[gate.id]?.note ?? '']),
  ));
  const [message, setMessage] = useState('');

  const environment = currentDeviceEnvironment();
  const summary = studioDeviceAcceptanceSummary(report);
  const diagnostics = useMemo(() => reactStudioDiagnostics({
    documentStoreStatus: documents.status,
    documentStoreAuthority: documents.authority === 'indexeddb',
    writerStatus: runtime.capabilitiesStatus,
    writerCapabilities: runtime.capabilities,
  }), [
    documents.authority,
    documents.status,
    runtime.capabilities,
    runtime.capabilitiesStatus,
    report.testedAt,
  ]);

  const saveGate = (gateId: string, passed: boolean) => {
    const eligibility = studioDeviceGateEnvironmentStatus(gateId, environment);
    if (passed && !eligibility.eligible) {
      setMessage(
        language === 'de'
          ? `Dieses Gerät kann den Gate nicht belegen: ${eligibility.reason}`
          : `This device cannot prove this gate: ${eligibility.reason}`,
      );
      return;
    }
    const next = updateDeviceGate(
      report,
      gateId,
      passed,
      notes[gateId] ?? '',
      environment,
    );
    persistDeviceAcceptance(next);
    setReport(next);
    setMessage(
      passed
        ? (language === 'de' ? 'Gate als manuell geprüft gespeichert.' : 'Gate saved as manually checked.')
        : (language === 'de' ? 'Gate als nicht bestanden gespeichert.' : 'Gate saved as failed.'),
    );
  };

  const importReports = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    try {
      const parsed = [];
      for (const file of files) {
        parsed.push(parseStudioDeviceAcceptance(await file.text()));
      }
      const merged = mergeStudioDeviceAcceptanceReports([report, ...parsed]);
      persistDeviceAcceptance(merged);
      setReport(merged);
      setNotes(Object.fromEntries(
        STUDIO_DEVICE_GATES.map((gate) => [gate.id, merged.results?.[gate.id]?.note ?? '']),
      ));
      setMessage(
        language === 'de'
          ? `${files.length} Acceptance-Report(s) zusammengeführt.`
          : `Merged ${files.length} acceptance report(s).`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className={styles.systemAcceptance} data-rhymelab-control="system.acceptance">
      <div className={styles.systemAcceptanceHead}>
        <div>
          <p className={styles.kicker}>R7 ACCEPTANCE</p>
          <h2>{language === 'de' ? 'Diagnostics & echte Geräte' : 'Diagnostics & real devices'}</h2>
          <span>
            {language === 'de'
              ? 'Source-/Browser-Diagnostik darf Device-Gates nicht automatisch bestehen lassen.'
              : 'Source/browser diagnostics never auto-pass physical device gates.'}
          </span>
        </div>
        <strong data-ready={summary.ready ? 'true' : 'false'}>
          {summary.passed}/{summary.total} DEVICE
        </strong>
      </div>

      <div className={styles.systemDiagnosticsSummary}>
        <div>
          <small>AUTOMATED / CURRENT BROWSER</small>
          <b>{diagnostics.summary.passing}/{diagnostics.summary.total}</b>
          <span>{diagnostics.summary.failing.length ? diagnostics.summary.failing.join(' · ') : 'PASS'}</span>
        </div>
        <div>
          <small>STARTUP BINDINGS</small>
          <b>{diagnostics.startupBindings.ok ? 'PASS' : 'FAIL'}</b>
          <span>{diagnostics.startupBindings.missing.join(' · ') || 'all required visible controls present'}</span>
        </div>
        <div>
          <small>ENVIRONMENT</small>
          <b>{studioDeviceEnvironmentLabel(environment)}</b>
          <span>{environment.audioSupported ? 'Web Audio' : 'no Web Audio'} · {environment.visualViewportSupported ? 'VisualViewport' : 'viewport fallback'}</span>
        </div>
      </div>

      <div className={styles.systemAcceptanceActions}>
        <button
          type="button"
          onClick={() => downloadJson(diagnosticsFilename(), diagnostics)}
        >
          {language === 'de' ? 'Diagnostics exportieren' : 'Export diagnostics'}
        </button>
        <button
          type="button"
          onClick={() => downloadJson(studioDeviceAcceptanceFilename(), report)}
        >
          {language === 'de' ? 'Device-Report exportieren' : 'Export device report'}
        </button>
        <button type="button" onClick={() => importRef.current?.click()}>
          {language === 'de' ? 'Device-Reports importieren' : 'Import device reports'}
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(event) => void importReports(event)}
        />
      </div>

      <div className={styles.deviceGateList}>
        {STUDIO_DEVICE_GATES.map((gate) => {
          const result = report.results?.[gate.id];
          const eligibility = studioDeviceGateEnvironmentStatus(gate.id, environment);
          return (
            <article key={gate.id} data-passed={result?.passed ? 'true' : 'false'}>
              <header>
                <div>
                  <small>{gate.id}</small>
                  <b>{gate.label}</b>
                </div>
                <span>{result?.passed ? 'PASS' : eligibility.eligible ? 'READY TO TEST' : 'OTHER DEVICE'}</span>
              </header>
              <p>{gate.instruction}</p>
              <small className={styles.deviceEligibility}>{eligibility.reason}</small>
              <textarea
                value={notes[gate.id] ?? ''}
                onChange={(event) => setNotes((current) => ({
                  ...current,
                  [gate.id]: event.target.value.slice(0, 400),
                }))}
                placeholder={language === 'de' ? 'Kurze Browser-/Gerätenotiz …' : 'Short browser/device note …'}
              />
              <div>
                <button
                  type="button"
                  disabled={!eligibility.eligible}
                  onClick={() => saveGate(gate.id, true)}
                >
                  {language === 'de' ? '✓ Manuell bestanden' : '✓ Manual pass'}
                </button>
                <button type="button" onClick={() => saveGate(gate.id, false)}>
                  {language === 'de' ? 'Nicht bestanden' : 'Failed'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {message ? <p className={styles.systemAcceptanceMessage} aria-live="polite">{message}</p> : null}
    </section>
  );
}
