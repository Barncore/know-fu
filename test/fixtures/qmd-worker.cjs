// Protocol fixture only. Live SDK and database parity are checked separately.
process.on('message', ({ id, request }) => {
  if (request.query === 'crash') return process.exit(9);
  if (request.query === 'hang') return;
  const reply = () => process.send({ id, items: [{ file: `qmd://${request.collections[0]}/fixture.md`, score: 1 }] });
  if (request.query === 'wait') setTimeout(reply, 50);
  else reply();
});
process.on('disconnect', () => process.exit(0));
