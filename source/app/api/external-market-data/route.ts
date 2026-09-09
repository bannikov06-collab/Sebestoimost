const LME_URL = 'https://www.lme.com/market-data/reports-and-data/lme-official-prices';
const CBR_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';

function numberValue(value: string) {
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function findLmeCash(text: string, metal: 'Aluminium' | 'Copper') {
  const escaped = metal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\s+([0-9][0-9,.]*)\\s+([0-9][0-9,.]*)`, 'i'));
  if (!match) return null;
  return { bid: numberValue(match[1]), ask: numberValue(match[2]) };
}

async function lme() {
  const response = await fetch(LME_URL, { headers: { 'user-agent': 'KLM-cost-calculator/32' }, cf: { cacheTtl: 1800 } } as RequestInit);
  if (!response.ok) throw new Error(`LME HTTP ${response.status}`);
  const html = await response.text();
  const text = stripHtml(html);
  const aluminium = findLmeCash(text, 'Aluminium');
  const copper = findLmeCash(text, 'Copper');
  const date = text.match(/Data valid for\s+([^|]+?)(?=Official prices|Cash|Aluminium)/i)?.[1]?.trim() ?? '';
  if (!aluminium?.ask || !copper?.ask) throw new Error('Не удалось распознать LME Official Prices');
  return { aluminium, copper, date, source: LME_URL };
}

async function cbr() {
  const response = await fetch(CBR_URL, { headers: { 'user-agent': 'KLM-cost-calculator/32' }, cf: { cacheTtl: 1800 } } as RequestInit);
  if (!response.ok) throw new Error(`CBR HTTP ${response.status}`);
  const xml = await response.text();
  const block = xml.match(/<Valute ID="R01235">([\s\S]*?)<\/Valute>/i)?.[1] ?? '';
  const nominal = numberValue(block.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1] ?? '1') ?? 1;
  const value = numberValue(block.match(/<Value>([^<]+)<\/Value>/i)?.[1] ?? '');
  const date = xml.match(/Date="([^"]+)"/i)?.[1] ?? '';
  if (!value) throw new Error('Не удалось распознать курс USD ЦБ РФ');
  return { usdRub: value / nominal, date, source: CBR_URL };
}

export async function GET() {
  const [lmeResult, cbrResult] = await Promise.allSettled([lme(), cbr()]);
  return Response.json({
    fetchedAt: new Date().toISOString(),
    lme: lmeResult.status === 'fulfilled' ? lmeResult.value : null,
    cbr: cbrResult.status === 'fulfilled' ? cbrResult.value : null,
    errors: [lmeResult.status === 'rejected' ? String(lmeResult.reason?.message ?? lmeResult.reason) : '', cbrResult.status === 'rejected' ? String(cbrResult.reason?.message ?? cbrResult.reason) : ''].filter(Boolean),
  });
}
