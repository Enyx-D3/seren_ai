import { readFile, writeFile } from 'node:fs/promises';

const [gradePath, keyPath] = process.argv.slice(2);
if (!gradePath || !keyPath) throw new Error('Usage: node tools/b2_score_human_review.mjs <completed-grades.json> <blind-key.json>');
const grades = JSON.parse(await readFile(gradePath, 'utf8'));
const key = JSON.parse(await readFile(keyPath, 'utf8'));
const systems = ['falcon_alone', 'falcon_plus_b2'];
const summary = Object.fromEntries(systems.map(system => [system, { count: 0, scoreSum: 0, preferred: 0 }]));
const rows = [];
for (const [id, order] of Object.entries(key)) {
  const grade = grades[id];
  if (!grade || ![0, 1, 2].includes(grade.response1?.score) || ![0, 1, 2].includes(grade.response2?.score) ||
      ![1, 2, 'tie'].includes(grade.preferred)) throw new Error(`incomplete blind grade: ${id}`);
  const responses = [grade.response1, grade.response2];
  for (let i = 0; i < 2; i++) {
    if (!systems.includes(order[i])) throw new Error(`invalid key: ${id}`);
    summary[order[i]].count++;
    summary[order[i]].scoreSum += responses[i].score;
    if (grade.preferred === i + 1) summary[order[i]].preferred++;
  }
  rows.push({ id, scores: Object.fromEntries(order.map((system, index) => [system, responses[index]])),
    preferredSystem: grade.preferred === 'tie' ? 'tie' : order[grade.preferred - 1] });
}
const outputPath = gradePath.replace(/\.json$/, '-scored.json');
await writeFile(outputPath, JSON.stringify({ sourceGrades: gradePath, sourceKey: keyPath, summary, rows }, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, summary }, null, 2));
