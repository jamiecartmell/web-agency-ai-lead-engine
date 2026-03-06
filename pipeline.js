import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Claude client ────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadSkill(filename) {
  return fs.readFileSync(path.join(__dirname, 'skills', filename), 'utf8');
}

function writeOutput(folder, prefix, suffix, data) {
  const filepath = path.join(folder, `${prefix}.${suffix}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  saved → ${filepath}`);
}

function toMessage(...parts) {
  // Joins labelled JSON inputs into a single user message
  return parts
    .map(([label, data]) => `${label}:\n${JSON.stringify(data, null, 2)}`)
    .join('\n\n');
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function runSkill(skillFile, userMessage, label) {
  console.log(`\n→ ${label}`);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: loadSkill(skillFile),
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;

  // Skills should return pure JSON — but extract it defensively just in case
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`${label} did not return valid JSON.\n\nResponse was:\n${text}`);
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline(inputFile, force = false) {
  const inputPath = path.resolve(inputFile);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const leadInput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const folder = path.dirname(inputPath);
  const prefix = path.basename(inputPath, '.input.json');

  console.log('\n' + '═'.repeat(56));
  console.log(`  Lead Engine Pipeline`);
  console.log(`  Business : ${leadInput.business_name}`);
  console.log(`  Input    : ${inputFile}`);
  console.log('═'.repeat(56));

  // ── Skill 0: Input Validator ──────────────────────────────────────────────
  const validated = await runSkill(
    '00_input_validator.md',
    toMessage(['Lead input', leadInput]),
    'Skill 0 — Input Validator'
  );
  writeOutput(folder, prefix, 'validated', validated);

  if (validated.validation_status === 'requires_review' && !force) {
    console.log('\n⚠  Validation status: requires_review');
    console.log('   Recommended action:', validated.recommended_action);
    if (validated.signal_conflicts.length) {
      console.log('\n   Signal conflicts:');
      validated.signal_conflicts.forEach(c => console.log(`   - ${c}`));
    }
    if (validated.edge_cases_detected.length) {
      console.log('\n   Edge cases:');
      validated.edge_cases_detected.forEach(e => console.log(`   - ${e}`));
    }
    console.log('\n   Pipeline paused. Fix the input or re-run with --force to continue anyway.');
    return;
  }

  // Use the normalised input for all downstream skills
  const input = validated.normalised_input ?? leadInput;

  // ── Skill 1: Local Opportunity Scanner ───────────────────────────────────
  const opportunityOutput = await runSkill(
    '01_local_opportunity_scanner.md',
    toMessage(['Lead input', input]),
    'Skill 1 — Opportunity Scanner'
  );
  writeOutput(folder, prefix, 'output', opportunityOutput);

  // ── Skill 2: Technical Website Audit ─────────────────────────────────────
  const auditOutput = await runSkill(
    '02_technical_website_audit.md',
    toMessage(['Lead input', input], ['Opportunity output (Skill 1)', opportunityOutput]),
    'Skill 2 — Technical Audit'
  );
  writeOutput(folder, prefix, 'audit', auditOutput);

  // ── Skill 3: Vertical Context Analyzer ───────────────────────────────────
  const verticalOutput = await runSkill(
    '03_vertical_context_analyzer.md',
    toMessage(['Lead input', input], ['Audit output (Skill 2)', auditOutput]),
    'Skill 3 — Vertical Context'
  );
  writeOutput(folder, prefix, 'vertical', verticalOutput);

  // ── Skill 4: Angle Strategy Engine ───────────────────────────────────────
  const angleOutput = await runSkill(
    '04_angle_strategy_engine.md',
    toMessage(
      ['Lead input', input],
      ['Audit output (Skill 2)', auditOutput],
      ['Vertical output (Skill 3)', verticalOutput]
    ),
    'Skill 4 — Angle Strategy'
  );
  writeOutput(folder, prefix, 'angle', angleOutput);

  // ── Skill 5: Email Personalisation Engine ─────────────────────────────────
  const emailOutput = await runSkill(
    '05_email_personalisation_engine.md',
    toMessage(
      ['Lead input', input],
      ['Opportunity output (Skill 1)', opportunityOutput],
      ['Audit output (Skill 2)', auditOutput],
      ['Angle output (Skill 4)', angleOutput]
    ),
    'Skill 5 — Email'
  );
  writeOutput(folder, prefix, 'email', emailOutput);

  // ── Skill 6: Proposal Generator ──────────────────────────────────────────
  const proposalOutput = await runSkill(
    '06_proposal_generator.md',
    toMessage(
      ['Lead input', input],
      ['Opportunity output (Skill 1)', opportunityOutput],
      ['Audit output (Skill 2)', auditOutput],
      ['Vertical output (Skill 3)', verticalOutput],
      ['Angle output (Skill 4)', angleOutput]
    ),
    'Skill 6 — Proposal'
  );
  writeOutput(folder, prefix, 'proposal', proposalOutput);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(56));
  console.log('  Pipeline complete');
  console.log('═'.repeat(56));
  console.log(`  Business  : ${leadInput.business_name}`);
  console.log(`  Opportunity : ${opportunityOutput.opportunity_level}`);
  console.log(`  Angle       : ${angleOutput.primary_angle_type}`);
  console.log(`  Offer       : ${angleOutput.recommended_offer_type}`);
  console.log(`  Proposal    : ${proposalOutput.proposal_type}`);
  console.log('\n  Email subject options:');
  emailOutput.subject_options.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  console.log('\n  Email CTA:');
  console.log(`    ${emailOutput.cta}`);
  console.log('═'.repeat(56) + '\n');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const inputFile = process.argv[2];
const force = process.argv.includes('--force');

if (!inputFile) {
  console.error('\nUsage:');
  console.error('  npm run pipeline <path-to-input.json> [--force]');
  console.error('\nExamples:');
  console.error('  npm run pipeline example/Core_Health/core_health.input.json');
  console.error('  npm run pipeline example/Woodfire/woodfire.input.json');
  console.error('  npm run pipeline example/Example_Cafe/example_cafe.input.json --force');
  process.exit(1);
}

runPipeline(inputFile, force).catch(err => {
  console.error('\n✗ Pipeline failed:', err.message);
  process.exit(1);
});
