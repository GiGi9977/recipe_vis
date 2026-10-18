const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const context = {
  console: {log() {}, group() {}, groupEnd() {}},
  isContainerNode: n => (n.state_r1 || n.state_r2)?.[1] === 'container',
  isAddEdge: e => e.action === 'add',
  getHalfOffsetForNode: n => n.domain === 'aux' ? 12 : 25,
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function nb_buildNodeById('), source.indexOf('function renderGraph(')), context);
const files = fs.readdirSync('data').filter(f => f.endsWith('.json') && f.includes('ice_cream'));
assert(files.length >= 2, 'Expected the two ice-cream regression recipes');
for (const file of files) {
  const recipe = JSON.parse(fs.readFileSync('data/' + file, 'utf8'));
  for (const kind of ['merged_exact', 'only_r1', 'only_r2']) {
    const nodes = recipe.nodes.map(n => ({id: 'M' + n.index, domain: n.type === 'main' ? 'main' : 'aux',
      kind, r1_node: n.index, state_r1: [n.name, n.type, n.physical_state, n.chemical_state]}));
    const edges = recipe.edges.map(e => ({source: 'M' + e.node1, target: 'M' + e.node2, action: e.action}));
    const semantics = JSON.stringify(nodes);
    const branches = context.newBranchLayout(nodes, edges, {});
    assert(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
    assert.equal(JSON.stringify(nodes.map(({x, y, ...n}) => n)), semantics);
    // Separate branches may now reuse a row when their X spans do not overlap.
    for (let i=0;i<branches.length;i++) for (let j=i+1;j<branches.length;j++)
      for (const a of branches[i].spine) for (const b of branches[j].spine)
        assert(Math.abs(a.x-b.x)>=60 || Math.abs(a.y-b.y)>=60, file+': branch nodes overlap');
    const branchOf = new Map(branches.flatMap((b,i) => b.spine.map(n => [n.id,i])));
    const positions = JSON.stringify(nodes.map(n => [n.id,n.x,n.y]));
    context.newBranchLayout(nodes, edges, {});
    assert.equal(JSON.stringify(nodes.map(n => [n.id,n.x,n.y])), positions);
    console.log('PASS:', file, kind, branches.length, 'non-overlapping branch nodes; unchanged semantics; deterministic');
  }
}
