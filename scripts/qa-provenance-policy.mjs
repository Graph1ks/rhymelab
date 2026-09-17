function scalar(db, sql) {
  return Number(Object.values(db.prepare(sql).get() || { value: 0 })[0] || 0);
}

export function auditPronunciationSourceDuplicates(db) {
  const sameSourceGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT surface, ipa, pronunciation_source
      FROM hot
      GROUP BY surface, ipa, pronunciation_source
      HAVING COUNT(*) > 1
    )
  `);

  const crossSourceGroups = scalar(db, `
    SELECT COUNT(*) FROM (
      SELECT surface, ipa
      FROM hot
      GROUP BY surface, ipa
      HAVING COUNT(*) > 1 AND COUNT(DISTINCT pronunciation_source) > 1
    )
  `);

  const sameSourceRowsBeyondFirst = scalar(db, `
    SELECT COALESCE(SUM(c - 1), 0) FROM (
      SELECT COUNT(*) AS c
      FROM hot
      GROUP BY surface, ipa, pronunciation_source
      HAVING c > 1
    )
  `);

  const crossSourceSamples = db.prepare(`
    SELECT surface, ipa, COUNT(*) AS row_count,
           COUNT(DISTINCT pronunciation_source) AS source_count,
           GROUP_CONCAT(DISTINCT pronunciation_source) AS sources,
           GROUP_CONCAT(DISTINCT lexicon_layer) AS layers
    FROM hot
    GROUP BY surface, ipa
    HAVING COUNT(*) > 1 AND COUNT(DISTINCT pronunciation_source) > 1
    ORDER BY row_count DESC, surface, ipa
    LIMIT 20
  `).all();

  const sameSourceSamples = db.prepare(`
    SELECT surface, ipa, pronunciation_source, COUNT(*) AS row_count,
           GROUP_CONCAT(DISTINCT lexicon_layer) AS layers
    FROM hot
    GROUP BY surface, ipa, pronunciation_source
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, surface, ipa, pronunciation_source
    LIMIT 20
  `).all();

  return {
    policy: 'same_surface_ipa_is_valid_when_pronunciation_source_differs',
    exact_surface_ipa_same_source_groups: sameSourceGroups,
    exact_surface_ipa_same_source_rows_beyond_first: sameSourceRowsBeyondFirst,
    exact_surface_ipa_cross_source_groups: crossSourceGroups,
    exact_surface_ipa_cross_source_samples: crossSourceSamples,
    exact_surface_ipa_same_source_samples: sameSourceSamples,
  };
}

export function applyPronunciationProvenanceIntegrity(report, provenanceAudit) {
  if (!report?.database || report.database.missing) return report;

  report.database.duplicates = {
    ...(report.database.duplicates || {}),
    ...provenanceAudit,
  };

  const structuralOk = report.database.integrity_check === 'ok'
    && (report.database.indexes?.missing?.length || 0) === 0
    && Number(report.database.invalid_total || 0) === 0;
  report.database.ok = structuralOk
    && provenanceAudit.exact_surface_ipa_same_source_groups === 0;

  if (report.gates) {
    report.gates.database_integrity = report.database.ok;
    report.status = Object.values(report.gates).every(Boolean) ? 'ok' : 'attention';
  }

  return report;
}
