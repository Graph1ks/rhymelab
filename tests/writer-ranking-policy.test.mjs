import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_RANKING_POLICY,
  lexicalOverlapEvidence,
  lexicalRedundancy,
  rankWriterRecommendedResults,
  writerUtilityFeatures,
} from '../src/writer-ranking-policy.mjs';

function morphology(familyKey) {
  return familyKey ? { familyKey, status: 'attested_right_head_candidate' } : null;
}

function row(word, score, extras = {}) {
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    lemma: word,
    score,
    rhymeTier: 1,
    syllableDistance: 0,
    usageRank: 20000,
    lexicalTags: [],
    primaryType: 'multisyllabic_slant',
    ...extras,
  };
}

function referenceEagerWriterRanking(rows,localQuery,{limit,diversityWeight=0.18}={}){
  const requestedLimit=Number.parseInt(String(limit??rows.length??1),10);
  const selectedLimit=Math.min(
    rows.length,
    Math.max(1,Number.isFinite(requestedLimit)?requestedLimit:1),
  );
  const remaining=rows.map((candidate,baseIndex)=>({
    row:candidate,
    baseIndex,
    writer:writerUtilityFeatures(candidate,localQuery),
    maxRedundancy:0,
  }));
  const selected=[];

  const state=(candidate)=>{
    const max=Number(candidate.maxRedundancy||0);
    const tierPenalty=max>=0.88?2:max>=0.58?1:0;
    return {
      effectiveTier:candidate.writer.writerTier+tierPenalty,
      tierPenalty,
      diversifiedScore:candidate.writer.utility-diversityWeight*max,
    };
  };
  const lexical=(a,b)=>String(a?.word||'').localeCompare(String(b?.word||''),'de');

  while(remaining.length&&selected.length<selectedLimit){
    let bestIndex=-1;
    for(let index=0;index<remaining.length;index++){
      const candidate=remaining[index];
      const a=state(candidate);
      const incumbent=bestIndex>=0?remaining[bestIndex]:null;
      const b=incumbent?state(incumbent):null;
      const better=!incumbent
        ||a.effectiveTier<b.effectiveTier
        ||(a.effectiveTier===b.effectiveTier&&(
          candidate.writer.lexicalSafetyTierPenalty<incumbent.writer.lexicalSafetyTierPenalty
          ||(candidate.writer.lexicalSafetyTierPenalty===incumbent.writer.lexicalSafetyTierPenalty&&(
            a.diversifiedScore>b.diversifiedScore+1e-9
            ||(Math.abs(a.diversifiedScore-b.diversifiedScore)<=1e-9&&(
              candidate.writer.utility>incumbent.writer.utility+1e-9
              ||(Math.abs(candidate.writer.utility-incumbent.writer.utility)<=1e-9&&(
                candidate.baseIndex<incumbent.baseIndex
                ||(candidate.baseIndex===incumbent.baseIndex
                  &&lexical(candidate.row,incumbent.row)<0)
              ))
            ))
          ))
        ));
      if(better)bestIndex=index;
    }

    const [winner]=remaining.splice(bestIndex,1);
    const winnerState=state(winner);
    selected.push({
      ...winner.row,
      writerRank:selected.length+1,
      writer:{
        ...winner.writer,
        effectiveTier:winnerState.effectiveTier,
        diversityTierPenalty:winnerState.tierPenalty,
        diversifiedScore:Number(winnerState.diversifiedScore.toFixed(4)),
        redundancyPenalty:Number((diversityWeight*winner.maxRedundancy).toFixed(4)),
        maxRedundancy:Number(winner.maxRedundancy.toFixed(4)),
      },
    });

    for(const candidate of remaining){
      candidate.maxRedundancy=Math.max(
        candidate.maxRedundancy,
        lexicalRedundancy(candidate.row,winner.row),
      );
    }
  }
  return selected;
}

function deterministicDiversityRows(count=180){
  const stems=['arbeits','hochzeits','sonder','kirchen','pilger','pauschal','frage','warte','leben','liebe','reise','weise'];
  return Array.from({length:count},(_,index)=>{
    const stem=stems[index%stems.length];
    const group=Math.floor(index/stems.length);
    const word=stem+(group%5===0?'reise':group%5===1?'weise':group%5===2?'zeiten':group%5===3?'zeichen':'klang')+index;
    return row(word,Number((0.99-(index%70)*0.004).toFixed(4)),{
      rhymeTier:index%9===0?0:index%7===0?2:1,
      primaryType:index%9===0?'perfect':index%7===0?'family':'multisyllabic_slant',
      usageRank:index%13===0?null:1000+index*137,
      lexicalTags:index%31===0?['rare']:[],
      lemma:index%17===0?'shared-lemma-'+(index%4):word,
      writerMorphology:index%11===0
        ?morphology('right:family-'+(index%6))
        :null,
    });
  });
}

const query = {
  language: 'de',
  surface: 'Arbeitsweise',
  normalized: 'arbeitsweise',
  lemma: 'Arbeitsweise',
  usageRank: 15000,
  writerMorphology: morphology('right:weise'),
};

test('writer ranking policy is explicit and deterministic', () => {
  assert.equal(WRITER_RANKING_POLICY, 'deterministic_writer_utility_v6');
  const rows = [
    row('Hochzeitsreise', 0.96, { usageRank: 12000, writerMorphology: morphology('right:reise') }),
    row('Arbeitszweige', 0.93, { usageRank: 10000, writerMorphology: morphology('right:zweige') }),
    row('Arbeitsweisen', 0.98, { lemma: 'Arbeitsweise', rhymeTier: 0, primaryType: 'perfect', usageRank: 7000 }),
    row('Notfallbleibe', 0.84, { rhymeTier: 3, primaryType: 'slant', syllableDistance: 1, usageRank: 25000 }),
  ];

  const first = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  const second = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  assert.deepEqual(first, second);
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitszweige'));
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitsweisen'));
});

test('same lemma and long shared compound prefix are writer penalties, not phonetic penalties', () => {
  const inflection = row('Arbeitsweisen', 0.99, { lemma: 'Arbeitsweise', rhymeTier: 0, primaryType: 'perfect' });
  const compoundClone = row('Arbeitszweige', 0.94);
  const distinct = row('Hochzeitsreise', 0.94);

  const inflectionEvidence = lexicalOverlapEvidence(query, inflection);
  const cloneEvidence = lexicalOverlapEvidence(query, compoundClone);
  const distinctEvidence = lexicalOverlapEvidence(query, distinct);

  assert.equal(inflectionEvidence.sameLemma, true);
  assert.equal(inflectionEvidence.overlap, 1);
  assert.ok(cloneEvidence.sharedPrefixLength >= 7);
  assert.ok(cloneEvidence.initialConstructionOverlap >= 0.65);
  assert.ok(cloneEvidence.overlap > distinctEvidence.overlap);

  const before = { score: inflection.score, type: inflection.primaryType };
  const writer = writerUtilityFeatures(inflection, query);
  assert.deepEqual({ score: inflection.score, type: inflection.primaryType }, before);
  assert.ok(writer.lexicalPenalty > 0);
  assert.equal(writer.cheapRhymeTierPenalty, 3);
  assert.ok(writerUtilityFeatures(compoundClone, query).cheapRhymeTierPenalty >= 1);
});

test('short orthographic perfect rhymes are not mistaken for cheap lexical variants', () => {
  const cases = [
    [
      { language: 'de', surface: 'Liebe', normalized: 'liebe', lemma: 'Liebe', usageRank: 1000 },
      row('Diebe', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', lemma: 'Dieb', usageRank: 14139 }),
    ],
    [
      { language: 'de', surface: 'Leben', normalized: 'leben', lemma: 'Leben', usageRank: 1000 },
      row('neben', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', lemma: 'neben', usageRank: 329 }),
    ],
    [
      { language: 'de', surface: 'Nacht', normalized: 'nacht', lemma: 'Nacht', usageRank: 1000 },
      row('macht', 1, { rhymeTier: 0, primaryType: 'perfect', lemma: 'machen', usageRank: 300 }),
    ],
  ];

  for (const [localQuery, candidate] of cases) {
    const evidence = lexicalOverlapEvidence(localQuery, candidate);
    const features = writerUtilityFeatures(candidate, localQuery);
    assert.ok(evidence.surfaceSimilarity >= 0.8);
    assert.equal(evidence.overlap, 0);
    assert.equal(features.cheapRhymeTierPenalty, 0);
  }

  const liebeQuery = cases[0][0];
  const diebe = cases[0][1];
  const krise = row('Krise', 0.8645, {
    rhymeTier: 1,
    primaryType: 'multisyllabic_slant',
    lemma: 'Krise',
    usageRank: 2140,
  });
  const ranked = rankWriterRecommendedResults([krise, diebe], liebeQuery, { limit: 2 });
  assert.equal(ranked[0].word, 'Diebe');
});

test('same attested right-head family is a writer penalty without changing phonetic truth', () => {
  const sameFamily = row('stellenweise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    writerMorphology: morphology('right:weise'),
  });
  const differentFamily = row('Hochzeitsreise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    writerMorphology: morphology('right:reise'),
  });

  const evidence = lexicalOverlapEvidence(query, sameFamily);
  assert.equal(evidence.sameMorphologyFamily, true);
  assert.equal(writerUtilityFeatures(sameFamily, query).cheapRhymeTierPenalty, 2);
  assert.equal(writerUtilityFeatures(differentFamily, query).cheapRhymeTierPenalty, 0);
  assert.equal(sameFamily.score, 1);
  assert.equal(sameFamily.primaryType, 'multisyllabic_perfect');
});

test('rhyme suffix spelling alone is not result redundancy', () => {
  const hochzeitsreise = row('Hochzeitsreise', 1, { writerMorphology: morphology('right:reise') });
  const sonderpreise = row('Sonderpreise', 1, { writerMorphology: morphology('right:preis') });
  const vorspeise = row('Vorspeise', 1, { writerMorphology: morphology('right:speise') });

  assert.equal(lexicalRedundancy(hochzeitsreise, sonderpreise), 0);
  assert.equal(lexicalRedundancy(hochzeitsreise, vorspeise), 0);
});

test('same morphology family is strong result-set redundancy', () => {
  const pilgerreise = row('Pilgerreise', 1, { writerMorphology: morphology('right:reise') });
  const pauschalreise = row('Pauschalreise', 1, { writerMorphology: morphology('right:reise') });
  const sonderpreise = row('Sonderpreise', 1, { writerMorphology: morphology('right:preis') });

  assert.equal(lexicalRedundancy(pilgerreise, pauschalreise), 0.92);
  assert.equal(lexicalRedundancy(pilgerreise, sonderpreise), 0);
});

test('shared lexical stems remain valid redundancy evidence', () => {
  const arbeitsreise = row('Arbeitsreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });
  const arbeitskreise = row('Arbeitskreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });
  const hochzeitsreise = row('Hochzeitsreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });

  assert.ok(lexicalRedundancy(arbeitsreise, arbeitskreise) >= 0.58);
  assert.equal(lexicalRedundancy(arbeitsreise, hochzeitsreise), 0);
});

test('phonetic tier gate stops unrelated slants from beating available family rhymes on commonness alone', () => {
  const rows = [
    row('Wartezeiten', 0.80, { rhymeTier: 2, primaryType: 'family', usageRank: 9000 }),
    row('jahrelange', 0.90, { rhymeTier: 3, primaryType: 'slant', usageRank: 1 }),
    row('Fragezeichen', 0.88, { rhymeTier: 3, primaryType: 'slant', usageRank: 2 }),
  ];

  const ranked = rankWriterRecommendedResults(rows, query, { limit: 3 });
  assert.equal(ranked[0].word, 'Wartezeiten');
  assert.equal(ranked[0].writer.effectiveTier, 2);
  assert.ok(ranked.slice(1).every((item) => item.writer.effectiveTier >= 3));
});

test('unranked and very-low-usage exact rhymes receive a conservative writer safety tier', () => {
  const commonExact = row('Sonderpreise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 54135,
  });
  const unknownExact = row('spiebe', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: null,
  });
  const veryLowExact = row('umschweben', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 994833,
  });
  const commonSlant = row('Krise', 0.86, {
    rhymeTier: 1,
    primaryType: 'multisyllabic_slant',
    usageRank: 2140,
  });

  const unknownFeatures = writerUtilityFeatures(unknownExact, query);
  const veryLowFeatures = writerUtilityFeatures(veryLowExact, query);
  assert.equal(unknownFeatures.lexicalSafety.state, 'unranked_unknown');
  assert.equal(unknownFeatures.lexicalSafetyTierPenalty, 1);
  assert.equal(veryLowFeatures.lexicalSafety.state, 'very_low_measured_usage');
  assert.equal(veryLowFeatures.lexicalSafetyTierPenalty, 1);

  const ranked = rankWriterRecommendedResults(
    [unknownExact, veryLowExact, commonSlant, commonExact],
    query,
    { limit: 4 },
  );
  assert.equal(ranked[0].word, 'Sonderpreise');
  assert.ok(ranked.findIndex((item) => item.word === 'Krise') < ranked.findIndex((item) => item.word === 'spiebe'));
  assert.ok(ranked.findIndex((item) => item.word === 'Krise') < ranked.findIndex((item) => item.word === 'umschweben'));
});

test('explicit rare or historical lexical evidence receives stronger safety demotion than unknown usage', () => {
  const rareExact = row('RareForm', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 10000,
    lexicalTags: ['rare'],
  });
  const unknownExact = row('UnknownForm', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: null,
  });

  const rare = writerUtilityFeatures(rareExact, query);
  const unknown = writerUtilityFeatures(unknownExact, query);
  assert.equal(rare.lexicalSafety.state, 'explicit_rare_or_historical');
  assert.equal(rare.lexicalSafetyTierPenalty, 2);
  assert.equal(unknown.lexicalSafetyTierPenalty, 1);
});

test('family diversity rotates exact rhyme heads before repeating one family', () => {
  const rows = [
    row('Pilgerreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 9000, writerMorphology: morphology('right:reise') }),
    row('Pauschalreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 10000, writerMorphology: morphology('right:reise') }),
    row('Sonderpreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 12000, writerMorphology: morphology('right:preis') }),
    row('Kirchenkreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 13000, writerMorphology: morphology('right:kreis') }),
  ];

  const ranked = rankWriterRecommendedResults(rows, query, { limit: 4 });
  const topThreeFamilies = ranked.slice(0, 3).map((item) => item.writerMorphology.familyKey);
  assert.equal(new Set(topThreeFamilies).size, 3);
  assert.ok(ranked.every((item, index) => item.writerRank === index + 1));
  assert.ok(ranked.every((item) => item.writer?.policy === WRITER_RANKING_POLICY));
});


test('lazy Writer diversity preserves the exact eager top prefix',()=>{
  const rows=deterministicDiversityRows(220);
  for(const limit of [1,10,40,120,200]){
    const expected=referenceEagerWriterRanking(rows,query,{limit});
    const actual=rankWriterRecommendedResults(rows,query,{
      limit,
      completeTail:false,
    }).slice(0,limit);
    assert.deepEqual(actual,expected);
  }
});

test('lazy Writer diversity stays exact across deterministic randomized inputs',()=>{
  let state=0x9e3779b9;
  const random=()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)/4294967296;
  };
  for(let round=0;round<18;round++){
    const rows=Array.from({length:45+Math.floor(random()*55)},(_,index)=>{
      const prefix=random()<0.35?'arbeits':random()<0.5?'sonder':'wort';
      const word=prefix+'-'+round+'-'+index+'-'+Math.floor(random()*12);
      return row(word,Number((0.55+random()*0.45).toFixed(4)),{
        rhymeTier:Math.floor(random()*4),
        primaryType:['perfect','multisyllabic_slant','family','slant'][Math.floor(random()*4)],
        syllableDistance:Math.floor(random()*3),
        usageRank:random()<0.15?null:1+Math.floor(random()*300000),
        lexicalTags:random()<0.08?['rare']:[],
        lemma:random()<0.1?'shared-'+Math.floor(random()*8):word,
        writerMorphology:random()<0.15
          ?morphology('right:'+Math.floor(random()*7))
          :null,
      });
    });
    const limit=Math.min(rows.length,5+Math.floor(random()*35));
    assert.deepEqual(
      rankWriterRecommendedResults(rows,query,{limit,completeTail:false}).slice(0,limit),
      referenceEagerWriterRanking(rows,query,{limit}),
    );
  }
});
