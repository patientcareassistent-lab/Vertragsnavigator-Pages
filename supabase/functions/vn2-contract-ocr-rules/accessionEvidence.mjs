/**
 * Vertragsnavigator 2.1: Read-only evidence assessment for one contract/site IK.
 * Importable by Supabase Edge Function and Node regression tests.
 * No outcome here is an authorization to supply, no hard business decisions.
 */
const clean = v => String(v ?? '').trim();
const normalized = v => clean(v).toLocaleLowerCase('de-DE');
const dateString = v => /^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : null;
const validStatus = row =>
  clean(row?.status) === 'Beigetreten' &&
  row?.active === true &&
  clean(row?.prerequisites_met) === 'Ja' &&
  clean(row?.vtv_status) === 'Gemeldet' &&
  clean(row?.contract_match_status) === 'EXACT' &&
  row?.review_required === false;

const negativeStatus = row => /(gekündigt|gekuendigt|widersproch|ausgesetzt|suspendiert)/i.test(clean(row?.status)) ||
  /(gekündigt|gekuendigt|ausgesetzt)/i.test(clean(row?.vtv_status)) ||
  row?.active === false;

export function pgMatch(accessionLevel, pg) {
  const code=clean(pg);
  if (!/^\d{2}$/.test(code)) return false;
  // "PG 24" matches, "PQ 24" and "PG 240" must not match.
  return new RegExp('(?:^|[^\\p{L}])PG\\s*0?'+code+'(?!\\d)', 'iu').test(clean(accessionLevel));
}

export function evaluateAccessionEvidence({
  site = null, contract = null, accessions = [], scopes = [], pg = '',
  truncatedAccessions = false, truncatedScopes = false, onDate = ''
} = {}) {
  const reasons = [];
  const stats={
    accession_rows:accessions.length,
    positive_accessions:accessions.filter(validStatus).length,
    negative_accessions:accessions.filter(negativeStatus).length,
    flagged_accessions:accessions.filter(x=>x.review_required===true ||
      clean(x.contract_match_status)!=='EXACT').length,
    scope_rows:scopes.length,pg_scoped_rows:0,pg_warnings:0
  };
  const requestedDay=dateString(onDate);
  let indicator='UNRESOLVED';
  if (!contract) {
    indicator='CONTRACT_NOT_FOUND';
    reasons.push('Vertrag nicht im Stamm zugeordnet.');
  } else if (contract.record_status!=='ACTIVE' || contract.archive_state!=='NOT_ARCHIVED') {
    indicator='CONTRACT_INACTIVE';
    reasons.push('Vertrag ist ungültig oder archiviert.');
  }
  if (!site) {
    indicator='SITE_UNKNOWN';
    reasons.push('Keine eindeutige IK im Standortstamm gefunden.');
  } else if (site.active!==true) {
    indicator='SITE_INACTIVE';
    reasons.push('Standort ist inaktiv; eine Beitrittszeile kann den Standort nicht freigeben.');
  }
  const fatal=['CONTRACT_NOT_FOUND','CONTRACT_INACTIVE','SITE_UNKNOWN','SITE_INACTIVE'].includes(indicator);
  if (!fatal) {
    if (truncatedAccessions || truncatedScopes) {
      indicator='EVIDENCE_INCOMPLETE';
      reasons.push('Treffermenge überschreitet die Abfragegrenze; keine vollständige Prüfung.');
    } else if (!accessions.length) {
      indicator='NO_ACCESSION';
      reasons.push('Kein passender Vertragsbeitritt in den strukturierten Beitrittsdaten.');
    } else {
      const positive=accessions.filter(validStatus);
      const negative=accessions.filter(negativeStatus);
      const needsReview=accessions.some(row=>row.review_required===true ||
        clean(row.contract_match_status)!=='EXACT');
      const unknown=accessions.some(row=>!validStatus(row)&&!negativeStatus(row));
      if (negative.length && positive.length) {
        indicator='CONFLICTING_ACCESSIONS';
        reasons.push('Widersprüchliche Beitrittszeilen: aktive und beendete/negative Einträge vorhanden.');
      } else if (negative.length===accessions.length) {
        indicator='NEGATIVE_ACCESSION';
        reasons.push('Nur negative oder beendete Beitrittsmeldungen vorhanden.');
      } else if (negative.length) {
        indicator='CONFLICTING_ACCESSIONS';
        reasons.push('Negative Beitrittsmeldung neben unbestätigten Zeilen vorhanden.');
      } else if (needsReview || unknown || !positive.length) {
        indicator='ACCESSION_REVIEW';
        reasons.push('Vertragsbeitritt ist mehrdeutig oder Voraussetzungen/VTV noch nicht bestätigt.');
      } else {
        indicator='POSITIVE_ACCESSION_HINT';
        reasons.push('Beitrittsstatus, Voraussetzungen und VTV sind als positiv gemeldet; dies bestätigt noch keine konkrete Versorgung.');
      }
    }
  }
  if (accessions.some(x=>!dateString(x.valid_from)||!dateString(x.valid_to))) {
    reasons.push('Mindestens eine Beitrittszeile hat keinen vollständig belegten Gültigkeitszeitraum.');
  }
  if (requestedDay) {
    const periodConflicts=accessions.filter(x=>
      (dateString(x.valid_from)&&x.valid_from>requestedDay)||
      (dateString(x.valid_to)&&x.valid_to<requestedDay)
    );
    if(periodConflicts.length) {
      if(indicator==='POSITIVE_ACCESSION_HINT')indicator='DATE_CONFLICT';
      reasons.push('Mindestens eine Beitrittszeile ist am Prüftag nicht gültig.');
    }
  }
  const pgRows=scopes.filter(x=>pgMatch(x.accession_level,pg));
  stats.pg_scoped_rows=pgRows.length;
  const adversePg=pgRows.filter(x=>
    /widerspruch|kündig|kuendig/i.test(clean(x.accession_type))||
    negativeStatus(x) || x.review_required===true ||
    !['UNIQUE_PAIR','UNIQUE_STATUS'].includes(clean(x.accession_match_status))||
    clean(x.contract_match_status)!=='EXACT'
  );
  stats.pg_warnings=adversePg.length;
  if (/^\d{2}$/.test(clean(pg))) {
    if (!pgRows.length) reasons.push('Kein PG-spezifischer Beitrittsnachweis für PG '+pg+'; Vertragsbeitritt ist damit nicht PG-bestätigt.');
    else if (adversePg.length) {
      reasons.push('PG '+pg+': Widerspruch, abweichender Status oder ungeklärte Zuordnung in der Vertragskomponentenliste.');
      if(indicator==='POSITIVE_ACCESSION_HINT')indicator='PG_COMPONENT_CONFLICT';
    } else {
      reasons.push('PG '+pg+': zugeordnete Komponenten vorhanden; fachlichen Geltungsumfang dennoch prüfen.');
    }
  } else {
    reasons.push('Keine PG ausgewählt; PG-bezogene Beitritte/Widersprüche nicht überprüft.');
  }
  if (stats.positive_accessions>1) reasons.push('Mehrere positive Beitrittszeilen: konkrete Beitrittsreferenz zuordnen.');
  reasons.push('Unabhängige Prüfung von Vertragszeitraum, PQ, Vertragsbeitritt, LEGS, konkreter Position, Genehmigung und Verordnung bleibt erforderlich.');
  return {
    decision:'PRUEFUNG_ERFORDERLICH',
    indicator,
    needs_manual_verification:true,
    stats, reasons,
    reference_only:true,
    assessed_on:requestedDay,
    // Return only compact non-sensitive references; no patient/employee data.
    accessions:accessions.slice(0,25).map(r=>({
      accession_id:r.accession_id,
      status:r.status,active:r.active,
      prerequisites_met:r.prerequisites_met,vtv_status:r.vtv_status,
      review_required:r.review_required,
      contract_match_status:r.contract_match_status,
      valid_from:r.valid_from,valid_to:r.valid_to,
      source:r.source
    })),
    pg_evidence:pgRows.slice(0,30).map(r=>({
      accession_detail_id:r.accession_detail_id,
      accession_level:r.accession_level,accession_type:r.accession_type,
      status:r.status,review_required:r.review_required,
      accession_match_status:r.accession_match_status,source:r.source
    }))
  };
}
