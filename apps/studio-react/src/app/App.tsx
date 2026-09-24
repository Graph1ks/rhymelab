import { useRef } from 'react';
import { Button } from '@base-ui/react/button';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, useReducedMotion } from 'motion/react';
import coverage from '../../parity-coverage.json';
import { useUiStore } from '../state/uiStore';
import styles from './App.module.css';

const allRows = [
  ...coverage.legacy_capabilities,
  ...coverage.additional_current_capabilities,
];

export function App() {
  const surface = useUiStore((state) => state.surface);
  const setSurface = useUiStore((state) => state.setSurface);
  const reduceMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 68,
    overscan: 8,
  });

  const verified = allRows.filter((row) => row.status === 'verified').length;

  return (
    <motion.main
      className={styles.shell}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RHYME LAB · REPLATFORM</p>
          <h1>React Studio migration shell</h1>
          <p className={styles.subtle}>
            Existing Studio V2 remains the behavioral golden master. Cutover is blocked until every parity row is verified.
          </p>
        </div>
        <div className={styles.actions}>
          <Button className={styles.button} onClick={() => setSurface('overview')}>
            Overview
          </Button>
          <Button className={styles.button} onClick={() => setSurface('parity')}>
            Parity inventory
          </Button>
        </div>
      </header>

      <section className={styles.summary} aria-label="Migration status">
        <article>
          <strong>{allRows.length}</strong>
          <span>mandatory rows</span>
        </article>
        <article>
          <strong>{verified}</strong>
          <span>verified</span>
        </article>
        <article>
          <strong>{allRows.length - verified}</strong>
          <span>blocking cutover</span>
        </article>
      </section>

      {surface === 'overview' ? (
        <section className={styles.panel}>
          <h2>R0 started</h2>
          <p>
            React, TypeScript, Vite, Base UI, Motion, TanStack Query, Zustand and TanStack Virtual are isolated here while the shipping Studio stays unchanged.
          </p>
          <p>
            Persistent documents remain owned by the existing IndexedDB DocumentStore; the accepted Node/Serving-v1/SQLite runtime is outside this replatform boundary.
          </p>
        </section>
      ) : (
        <section className={styles.panel}>
          <div className={styles.parityHeader}>
            <h2>Parity inventory</h2>
            <span>{verified}/{allRows.length} verified</span>
          </div>
          <div ref={scrollerRef} className={styles.scroller}>
            <div className={styles.virtualSpace} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = allRows[item.index];
                if (!row) return null;
                return (
                  <div
                    key={row.id}
                    className={styles.parityRow}
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <div>
                      <strong>{row.id}</strong>
                      <span>{row.group}</span>
                    </div>
                    <p>{row.capability}</p>
                    <code>{row.status}</code>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </motion.main>
  );
}
