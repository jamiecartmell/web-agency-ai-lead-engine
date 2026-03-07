import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.join(__dirname, 'example');
const trackingPath = path.join(__dirname, 'tracking.csv');

const headers = [
  'Date', 'Business Name', 'Industry', 'Location', 'Website',
  'Opportunity', 'Angle', 'Offer', 'Proposal Type',
  'Subject 1', 'Subject 2', 'Subject 3',
  'Email Body', 'CTA', 'Follow-up Body',
  'Status', 'Follow-up Sent', 'Response', 'Notes',
];

const escape = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

function readJson(filepath) {
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function buildRow(folder) {
  const files = fs.readdirSync(folder);
  const prefix = files.find(f => f.endsWith('.input.json'))?.replace('.input.json', '');
  if (!prefix) return null;

  const input    = readJson(path.join(folder, `${prefix}.input.json`));
  const output   = readJson(path.join(folder, `${prefix}.output.json`));
  const angle    = readJson(path.join(folder, `${prefix}.angle.json`));
  const proposal = readJson(path.join(folder, `${prefix}.proposal.json`));
  const email    = readJson(path.join(folder, `${prefix}.email.json`));

  if (!input || !output || !angle || !proposal || !email) {
    console.log(`  skipped (incomplete): ${path.basename(folder)}`);
    return null;
  }

  return [
    new Date().toISOString().split('T')[0],
    input.business_name,
    input.industry ?? '',
    input.location ?? '',
    input.website ?? '',
    output.opportunity_level ?? '',
    angle.primary_angle_type ?? '',
    angle.recommended_offer_type ?? '',
    proposal.proposal_type ?? '',
    email.subject_options?.[0] ?? '',
    email.subject_options?.[1] ?? '',
    email.subject_options?.[2] ?? '',
    email.email_body ?? '',
    email.cta ?? '',
    email.follow_up_body ?? '',
    '', '', '', '',
  ];
}

// Delete existing tracking.csv and rebuild from scratch
if (fs.existsSync(trackingPath)) fs.unlinkSync(trackingPath);
fs.writeFileSync(trackingPath, headers.map(escape).join(',') + '\n');

const folders = fs.readdirSync(exampleDir)
  .map(name => path.join(exampleDir, name))
  .filter(p => fs.statSync(p).isDirectory());

let count = 0;
for (const folder of folders) {
  const row = buildRow(folder);
  if (row) {
    fs.appendFileSync(trackingPath, row.map(escape).join(',') + '\n');
    console.log(`  added: ${row[1]}`);
    count++;
  }
}

console.log(`\nDone — ${count} rows written to tracking.csv`);
