import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import type { PerformanceConfig, PerformanceCue } from '../../legacy/contracts';
import {
  autoMapPerformanceBar,
  clearPerformanceBar,
  ensurePerformanceSong,
  getPerformanceCue,
  markPerformanceReviewed,
  movePerformanceCue,
  performanceBarDurationMs,
  performanceBarMetrics,
  performanceConfig,
  performanceCueSymbol,
  performanceFlowFingerprint,
  performancePocketMetrics,
  performancePreviousBarPlacements,
  performanceStepDurationMs,
  performanceSyllablesPerSecond,
  setPerformanceConfig,
  setPerformanceCue,
  trackedEditorBarNumber,
  trackedEditorLineIndexes,
} from '../../legacy/editor';
import { estimateSyllables } from '../../legacy/search';
import { useUiStore } from '../../state/uiStore';
import { useEditorSession } from '../editor/EditorSessionProvider';
import { asEditorSong } from '../editor/model';
import styles from './Performance.module.css';

type CueTool = PerformanceCue['type'] | 'erase' | 'move';

interface BarRow {
  index: number;
  id: string;
  number: number;
  text: string;
}

function clonedPerformanceSong(song: ReturnType<typeof useEditorSession>['activeSong']) {
  if (!song) return null;
  const copy = structuredClone(song);
  const editorSong = asEditorSong(copy);
  ensurePerformanceSong(editorSong);
  return editorSong;
}

function cueLabel(cue: PerformanceCue | null, step: number, language: 'de' | 'en') {
  if (!cue) return language === 'de' ? `Schritt ${step + 1}: leer` : `Step ${step + 1}: empty`;
  const type = ({
    hit: language === 'de' ? 'Hit' : 'Hit',
    accent: language === 'de' ? 'Akzent' : 'Accent',
    pause: language === 'de' ? 'Pause' : 'Pause',
    breath: language === 'de' ? 'Atem' : 'Breath',
    hold: language === 'de' ? 'Halten' : 'Hold',
  } as Record<string, string>)[cue.type] ?? cue.type;
  return cue.type === 'pause'
    ? `${language === 'de' ? 'Schritt' : 'Step'} ${step + 1}: ${type} · ${cue.length}`
    : `${language === 'de' ? 'Schritt' : 'Step'} ${step + 1}: ${type}`;
}

function Metric({ label, value, copy }: { label: string; value: string | number; copy?: string }) {
  return (
    <article className={styles.metric}>
      <small>{label}</small>
      <b>{value}</b>
      {copy ? <span>{copy}</span> : null}
    </article>
  );
}

export function PerformanceWorkspace({
  onOpenEditor,
}: {
  onOpenEditor: () => void;
}) {
  const language = useUiStore((state) => state.uiLanguage);
  const editor = useEditorSession();
  const [selectedBarId, setSelectedBarId] = useState('');
  const [tool, setTool] = useState<CueTool>('hit');
  const [moveFrom, setMoveFrom] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [flowMode, setFlowMode] = useState<'loop' | 'advance'>('advance');
  const selectedBarIdRef = useRef('');
  const flowModeRef = useRef<'loop' | 'advance'>('advance');
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef(0);
  const latestSongRef = useRef(editor.activeSong);

  const bars = useMemo<BarRow[]>(() => {
    const song = editor.activeSong;
    if (!song) return [];
    const editorSong = asEditorSong(song);
    return trackedEditorLineIndexes(editorSong).map((index) => ({
      index,
      id: editorSong.barIds[index] ?? '',
      number: trackedEditorBarNumber(editorSong, index) ?? 0,
      text: editorSong.lines[index] ?? '',
    }));
  }, [editor.activeSong]);

  useEffect(() => {
    latestSongRef.current = editor.activeSong;
  }, [editor.activeSong]);

  useEffect(() => {
    selectedBarIdRef.current = selectedBarId;
  }, [selectedBarId]);

  useEffect(() => {
    flowModeRef.current = flowMode;
  }, [flowMode]);

  useEffect(() => {
    const selected = editor.selection?.barId;
    if (selected && bars.some((bar) => bar.id === selected)) {
      setSelectedBarId(selected);
      return;
    }
    setSelectedBarId((current) => (
      bars.some((bar) => bar.id === current) ? current : (bars[0]?.id ?? '')
    ));
  }, [bars, editor.selection?.barId]);

  const song = clonedPerformanceSong(editor.activeSong);
  const selectedBar = bars.find((bar) => bar.id === selectedBarId) ?? bars[0] ?? null;
  const config = song ? performanceConfig(song) : {
    bpm: 92,
    grid: 16,
    feel: 'straight',
    tempoScale: 1,
    pauseLength: 1,
  } satisfies PerformanceConfig;
  const metrics = song && selectedBar ? performanceBarMetrics(song, selectedBar.id) : null;
  const pocket = song && selectedBar ? performancePocketMetrics(song, selectedBar.id) : null;
  const previous = song && selectedBar ? performancePreviousBarPlacements(song, selectedBar.id) : null;
  const fingerprint = song && selectedBar ? performanceFlowFingerprint(song, selectedBar.id) : '';
  const durationMs = song ? performanceBarDurationMs(song) : 0;
  const syllables = selectedBar ? estimateSyllables(selectedBar.text) : 0;
  const syllablesPerSecond = song ? performanceSyllablesPerSecond(song, syllables) : 0;
  const transportSignature = [
    config.bpm,
    config.grid,
    config.feel,
    config.tempoScale,
  ].join('|');

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    tickRef.current = 0;
    setPlaying(false);
    setPlayhead(-1);
    setCountInRemaining(0);
  }, []);

  useEffect(() => {
    stop();
  }, [stop, transportSignature]);

  useEffect(() => () => {
    stop();
    void audioRef.current?.close().catch(() => {});
  }, [stop]);

  const mutate = useCallback(async (
    action: (song: NonNullable<ReturnType<typeof clonedPerformanceSong>>) => void | boolean,
  ) => editor.mutateActiveSong((source) => {
    const target = asEditorSong(source);
    ensurePerformanceSong(target);
    return action(target);
  }), [editor]);

  const patchConfig = async (patch: Partial<PerformanceConfig>) => {
    await mutate((target) => {
      setPerformanceConfig(target, patch);
      return true;
    });
    setMoveFrom(null);
  };

  const placeCue = async (step: number) => {
    if (!selectedBar) return;
    if (tool === 'move') {
      const current = clonedPerformanceSong(latestSongRef.current);
      const existing = current ? getPerformanceCue(current, selectedBar.id, step) : null;
      if (moveFrom == null) {
        if (existing) setMoveFrom(step);
        return;
      }
      await mutate((target) => movePerformanceCue(target, selectedBar.id, moveFrom, step));
      setMoveFrom(null);
      return;
    }

    await mutate((target) => {
      setPerformanceCue(target, selectedBar.id, step, tool, {
        length: performanceConfig(target).pauseLength,
      });
      return true;
    });
  };

  const moveCue = async (from: number, to: number) => {
    if (!selectedBar || from === to) return;
    await mutate((target) => movePerformanceCue(target, selectedBar.id, from, to));
    setMoveFrom(null);
  };

  const start = async () => {
    if (playing) {
      stop();
      return;
    }
    const current = clonedPerformanceSong(latestSongRef.current);
    const bar = bars.find((item) => item.id === selectedBarId) ?? bars[0];
    if (!current || !bar) return;

    try {
      const AudioCtor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new Error('AudioContext unavailable');
      const context = audioRef.current ?? new AudioCtor();
      audioRef.current = context;
      await context.resume();
      setPlaying(true);
      selectedBarIdRef.current = bar.id;
      tickRef.current = -(countInBars * performanceConfig(current).grid);
      setCountInRemaining(countInBars * 4);

      const pulse = () => {
        const latest = clonedPerformanceSong(latestSongRef.current);
        if (!latest) {
          stop();
          return;
        }
        const latestConfig = performanceConfig(latest);
        const steps = latestConfig.grid;
        const rawTick = tickRef.current;
        const inCountIn = rawTick < 0;
        const currentStep = ((rawTick % steps) + steps) % steps;
        const activeBarId = selectedBarIdRef.current || bar.id;
        setPlayhead(inCountIn ? -1 : currentStep);
        setCountInRemaining(inCountIn
          ? Math.ceil(Math.abs(rawTick) / Math.max(1, steps / 4))
          : 0);
        const cue = inCountIn ? null : getPerformanceCue(latest, activeBarId, currentStep);

        if (currentStep % (steps / 4) === 0 || cue?.type === 'accent' || cue?.type === 'hit') {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = inCountIn
            ? (currentStep === 0 ? 1080 : 720)
            : cue?.type === 'accent' ? 1120 : currentStep === 0 ? 960 : 620;
          const gainValue = cue?.type === 'hit' || cue?.type === 'accent' ? 0.06 : 0.04;
          gain.gain.setValueAtTime(gainValue, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.045);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.05);
        }

        if (!inCountIn && currentStep === steps - 1 && flowModeRef.current === 'advance') {
          const activeIndex = bars.findIndex((item) => item.id === activeBarId);
          const next = bars[activeIndex + 1];
          if (next) {
            selectedBarIdRef.current = next.id;
            setSelectedBarId(next.id);
          }
        }

        const duration = performanceStepDurationMs(latest, currentStep);
        tickRef.current = rawTick + 1;
        timerRef.current = setTimeout(pulse, duration);
      };

      pulse();
    } catch {
      stop();
    }
  };

  if (!editor.activeSong) {
    return (
      <section className={styles.empty}>
        <p>R6 · PERFORM</p>
        <h2>{language === 'de' ? 'Kein aktiver Text.' : 'No active document.'}</h2>
      </section>
    );
  }

  if (!bars.length || !selectedBar || !song) {
    return (
      <section className={styles.empty}>
        <p>R6 · PERFORM</p>
        <h2>{language === 'de' ? 'Keine getrackte Bar.' : 'No tracked bar.'}</h2>
        <span>{language === 'de' ? 'Leerzeilen und [Section]-Zeilen werden nicht sequenziert.' : 'Blank and [Section] lines are not sequenced.'}</span>
      </section>
    );
  }

  const currentBarIndex = bars.findIndex((bar) => bar.id === selectedBar.id);
  const steps = config.grid;

  return (
    <section className={styles.workspace} data-r6-perform="true">
      <header className={styles.header}>
        <div>
          <p>R6 · PERFORM / BAR {String(selectedBar.number).padStart(2, '0')}</p>
          <h1>{language === 'de' ? 'Booth-Modus.' : 'Booth mode.'}</h1>
          <span>{selectedBar.text || (language === 'de' ? 'Leere Bar' : 'Empty bar')}</span>
        </div>
        <div className={styles.barNav}>
          <button
            type="button"
            disabled={currentBarIndex <= 0}
            onClick={() => setSelectedBarId(bars[currentBarIndex - 1]?.id ?? selectedBar.id)}
            aria-label={language === 'de' ? 'Vorherige Bar' : 'Previous bar'}
          >
            ←
          </button>
          <select value={selectedBar.id} onChange={(event) => setSelectedBarId(event.target.value)} aria-label={language === 'de' ? 'Bar auswählen' : 'Select bar'}>
            {bars.map((bar) => <option key={bar.id} value={bar.id}>Bar {String(bar.number).padStart(2, '0')} · {bar.text.slice(0, 36)}</option>)}
          </select>
          <button
            type="button"
            disabled={currentBarIndex >= bars.length - 1}
            onClick={() => setSelectedBarId(bars[currentBarIndex + 1]?.id ?? selectedBar.id)}
            aria-label={language === 'de' ? 'Nächste Bar' : 'Next bar'}
          >
            →
          </button>
          <button type="button" onClick={() => { editor.jumpToBar(selectedBar.id); onOpenEditor(); }}>
            {language === 'de' ? 'Im Editor' : 'Open editor'}
          </button>
        </div>
      </header>

      <section className={styles.booth}>
        <div className={styles.boothContext}>
          <span>
            <small>{language === 'de' ? 'DAVOR' : 'PREVIOUS'}</small>
            {bars[currentBarIndex - 1]?.text || '—'}
          </span>
          <article>
            <small>BAR {String(selectedBar.number).padStart(2, '0')}</small>
            <b>{selectedBar.text || (language === 'de' ? 'Leere Bar' : 'Empty bar')}</b>
          </article>
          <span>
            <small>{language === 'de' ? 'DANACH' : 'NEXT'}</small>
            {bars[currentBarIndex + 1]?.text || '—'}
          </span>
        </div>
        <div className={styles.boothStatus} data-playing={playing ? 'true' : 'false'}>
          <small>{playing ? (countInRemaining ? 'COUNT-IN' : 'LIVE') : (language === 'de' ? 'BEREIT' : 'READY')}</small>
          <strong>{countInRemaining || (playing ? String(playhead + 1).padStart(2, '0') : '—')}</strong>
          <span>{flowMode === 'advance'
            ? (language === 'de' ? 'Auto zur nächsten Bar' : 'Auto next bar')
            : (language === 'de' ? 'Aktuelle Bar loopen' : 'Loop current bar')}</span>
        </div>
      </section>

      <div className={styles.metrics}>
        <Metric label={language === 'de' ? 'SILBEN ≈' : 'SYLLABLES ≈'} value={syllables} />
        <Metric label="CUES" value={metrics?.cues ?? 0} />
        <Metric label={language === 'de' ? 'AKZENTE' : 'ACCENTS'} value={metrics?.accents ?? 0} />
        <Metric label={language === 'de' ? 'DICHTE' : 'DENSITY'} value={String(Math.round((metrics?.density ?? 0) * 100)) + '%'} />
      </div>

      {metrics?.needsReview ? (
        <div className={styles.review}>
          <div>
            <b>{language === 'de' ? 'Timing prüfen' : 'Review timing'}</b>
            <span>{language === 'de'
              ? 'Der Bar-Text wurde nach dem Cue-Mapping geändert. Cues bleiben an der stabilen Bar-ID.'
              : 'The bar text changed after cue mapping. Cues remain anchored to the stable Bar ID.'}</span>
          </div>
          <button type="button" onClick={() => void mutate((target) => { markPerformanceReviewed(target, selectedBar.id); return true; })}>
            {language === 'de' ? 'Als geprüft markieren' : 'Mark reviewed'}
          </button>
        </div>
      ) : null}

      <section className={styles.transport}>
        <label>
          <span>BPM</span>
          <input
            type="number"
            min="40"
            max="220"
            value={config.bpm}
            onChange={(event) => void patchConfig({ bpm: Number(event.target.value) || 92 })}
          />
        </label>
        <div className={styles.segmented} role="group" aria-label="Feel">
          {(['straight', 'triplet'] as const).map((value) => (
            <button type="button" key={value} data-active={config.feel === value} aria-pressed={config.feel === value} onClick={() => void patchConfig({ feel: value })}>
              {value === 'straight' ? 'Straight' : 'Triplet'}
            </button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label={language === 'de' ? 'Raster' : 'Grid'}>
          {([8, 16] as const).map((value) => (
            <button type="button" key={value} data-active={steps === value} aria-pressed={steps === value} onClick={() => void patchConfig({ grid: value })}>{value}</button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label={language === 'de' ? 'Tempo-Faktor' : 'Tempo scale'}>
          {([0.5, 1, 2] as const).map((value) => (
            <button type="button" key={value} data-active={config.tempoScale === value} aria-pressed={config.tempoScale === value} onClick={() => void patchConfig({ tempoScale: value })}>
              {value === 0.5 ? '½×' : value === 2 ? '2×' : '1×'}
            </button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label={language === 'de' ? 'Count-in' : 'Count in'}>
          {([0, 1, 2] as const).map((value) => (
            <button type="button" key={value} data-active={countInBars === value} aria-pressed={countInBars === value} onClick={() => setCountInBars(value)}>
              {value === 0 ? 'No count' : `${value} bar`}
            </button>
          ))}
        </div>
        <div className={styles.segmented} role="group" aria-label={language === 'de' ? 'Bar-Fortschritt' : 'Bar progression'}>
          <button type="button" data-active={flowMode === 'loop'} aria-pressed={flowMode === 'loop'} onClick={() => setFlowMode('loop')}>
            {language === 'de' ? 'Loop Bar' : 'Loop bar'}
          </button>
          <button type="button" data-active={flowMode === 'advance'} aria-pressed={flowMode === 'advance'} onClick={() => setFlowMode('advance')}>
            {language === 'de' ? 'Auto weiter' : 'Auto next'}
          </button>
        </div>
        <button type="button" className={styles.play} onClick={() => void start()} aria-pressed={playing}>
          {playing ? '■ Stop' : '▶ Metronom'}
        </button>
      </section>

      <section className={styles.sequencer}>
        <div className={styles.sequencerHead}>
          <div>
            <p>TIMING & CUES</p>
            <h2>{steps} {language === 'de' ? 'Schritte' : 'steps'}</h2>
            <span>{language === 'de' ? 'Stabile Bar-ID' : 'Stable Bar ID'} · <code>{selectedBar.id}</code></span>
          </div>
          {tool === 'move' ? <strong>{moveFrom == null ? (language === 'de' ? 'Quelle wählen oder Cue ziehen.' : 'Choose source or drag a cue.') : (language === 'de' ? 'Ziel wählen.' : 'Choose target.')}</strong> : null}
        </div>

        <div className={styles.tools} role="group" aria-label={language === 'de' ? 'Cue-Werkzeug' : 'Cue tool'}>
          {([
            ['move', '↔ Move'],
            ['hit', '● Hit'],
            ['accent', language === 'de' ? '▲ Akzent' : '▲ Accent'],
            ['pause', 'Ⅱ Pause'],
            ['breath', language === 'de' ? '◌ Atem' : '◌ Breath'],
            ['hold', language === 'de' ? '→ Halten' : '→ Hold'],
            ['erase', language === 'de' ? '× Löschen' : '× Erase'],
          ] as Array<[CueTool, string]>).map(([value, label]) => (
            <button
              type="button"
              key={value}
              data-active={tool === value}
              aria-pressed={tool === value}
              onClick={() => { setTool(value); setMoveFrom(null); }}
            >
              {label}
            </button>
          ))}
          {tool === 'pause' ? (
            <label className={styles.pauseLength}>
              <span>{language === 'de' ? 'Pausenlänge' : 'Pause length'}</span>
              <select value={config.pauseLength} onChange={(event) => void patchConfig({ pauseLength: Number(event.target.value) as 1 | 2 | 3 | 4 })}>
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'step' : 'steps'}</option>)}
              </select>
            </label>
          ) : null}
        </div>

        <div className={styles.grid} data-steps={steps}>
          {Array.from({ length: steps }, (_, step) => {
            const cue = getPerformanceCue(song, selectedBar.id, step);
            const selected = moveFrom === step;
            return (
              <button
                type="button"
                key={step}
                className={styles.step}
                data-cue={cue?.type || 'empty'}
                data-selected={selected ? 'true' : 'false'}
                data-playhead={playhead === step ? 'true' : 'false'}
                draggable={Boolean(cue)}
                aria-label={cueLabel(cue, step, language)}
                onClick={() => void placeCue(step)}
                onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                  if (!cue) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData('text/plain', String(step));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event: DragEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData('text/plain'));
                  if (Number.isInteger(from)) void moveCue(from, step);
                }}
              >
                <span>{performanceCueSymbol(cue)}</span>
                <small>{step % (steps / 4) === 0 ? Math.floor(step / (steps / 4)) + 1 : '·'}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.insights}>
          <Metric label="BAR TIME" value={(durationMs / 1000).toFixed(2) + ' s'} copy="4/4 · BPM × tempo" />
          <Metric label="SYLL./SEC ≈" value={syllablesPerSecond.toFixed(2)} />
          <Metric label="POCKET" value={String(Math.round((pocket?.offBeatShare ?? 0) * 100)) + '% off'} copy={String(pocket?.onBeat ?? 0) + ' on · ' + String(pocket?.offBeat ?? 0) + ' off'} />
          <Metric label="BREATH LOAD" value={pocket?.breathLoad ?? 0} copy={String(pocket?.breaths ?? 0) + ' breath · ' + String(pocket?.pauseUnits ?? 0) + ' pause'} />
          <Metric label="FLOW FINGERPRINT" value={fingerprint || '·'} />
          <Metric label="PREVIOUS BAR" value={previous?.previousBarId ? String(previous.sharedCount) + ' shared' : '—'} />
        </div>

        <div className={styles.actions}>
          <span>{config.feel === 'triplet' ? 'Triplet · 2:1 pulse' : 'Straight'} · {config.tempoScale === 0.5 ? 'Half Time' : config.tempoScale === 2 ? 'Double Time' : 'Normal Time'}</span>
          <div>
            <button type="button" onClick={() => void mutate((target) => { autoMapPerformanceBar(target, selectedBar.id, syllables); return true; })}>Auto-Map ≈</button>
            <button type="button" onClick={() => void mutate((target) => { clearPerformanceBar(target, selectedBar.id); return true; })}>{language === 'de' ? 'Cues leeren' : 'Clear cues'}</button>
          </div>
        </div>
      </section>
    </section>
  );
}
