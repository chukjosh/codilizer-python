const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/../webview/index.html', 'utf8');

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({
        postMessage: (msg) => { window.__lastPostedMessage = msg; }
      });
      window.mermaid = {
        render: async (id, source) => {
          window.__mermaidRender = { id, source };
          return { svg: '<svg data-rendered="true"></svg>' };
        }
      };
      window.katex = {
        renderToString: (tex, options) => {
          window.__katexCalls = window.__katexCalls || [];
          window.__katexCalls.push({ tex, options });
          return '<span class="katex" data-typeset="true">rendered</span>';
        }
      };
      window.HTMLElement.prototype.getBoundingClientRect = function () {
        return { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 };
      };
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.requestAnimationFrame = (cb) => cb();
    }
  });
  const { window } = dom;

  await new Promise((resolve) => {
    window.addEventListener('load', resolve);
    setTimeout(resolve, 500); // fallback in case 'load' already fired
  });

  const snapshot1 = {
    frames: [{
      id: 'f1',
      functionName: 'linear_search',
      line: 3,
      sourcePath: '/tmp/sample.py',
      variables: [
        { name: 'lst', type: 'list', value: 'ref:100', isRef: true, refId: '100' },
        { name: 'total', type: 'int', value: '5', isRef: false, containerRef: 42 }
      ]
    }],
    heap: [
      { id: '100', type: 'list', preview: ['0: 1', '1: 2', '2: 3'], truncated: false, size: 3 }
    ],
    edges: [{ from: 'lst', to: '100' }],
    currentLine: 3,
    timestamp: Date.now()
  };

  function post(type, payload) {
    window.dispatchEvent(new window.MessageEvent('message', { data: { type, payload } }));
  }

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) { console.error('FAIL:', msg); failures++; }
    else { console.log('PASS:', msg); }
  }

  post('snapshot', snapshot1);

  const doc = window.document;
  assert(doc.getElementById('root').style.display !== 'none', 'root becomes visible after first snapshot');
  assert(doc.querySelectorAll('.frame').length === 1, 'one frame card rendered');
  assert(doc.querySelectorAll('.heap').length === 1, 'one heap card rendered');
  assert(doc.querySelector('.var-row.ref') !== null, 'reference variable row rendered');
  assert(doc.getElementById('edge-overlay').children.length === 1, 'one edge path drawn for the ref variable');

  window.switchView('mermaid');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(doc.querySelector('#mermaid-diagram svg[data-rendered="true"]') !== null, 'Mermaid graph renders into the diagram panel');
  assert(window.__mermaidRender.source.includes('F_0 -.->|"ref lst"| H_100'), 'Mermaid renderer receives stack-to-heap edges');
  assert(doc.getElementById('mermaid-code').textContent.includes('graph TD'), 'Mermaid source remains available');
  window.switchView('interactive');

  const frameElBefore = doc.querySelector('.frame');

  // Send an identical snapshot again — diffing should leave the DOM node
  // untouched (same object reference), proving diff-based rendering works.
  post('snapshot', JSON.parse(JSON.stringify(snapshot1)));
  const frameElAfter = doc.querySelector('.frame');
  assert(frameElBefore === frameElAfter, 'unchanged frame is not rebuilt (diff-based rendering)');

  // Now send a snapshot where the variable value changed — the frame
  // should be rebuilt (different DOM node).
  const snapshot2 = JSON.parse(JSON.stringify(snapshot1));
  snapshot2.frames[0].variables[1].value = '999';
  post('snapshot', snapshot2);
  const frameElChanged = doc.querySelector('.frame');
  assert(frameElChanged !== frameElBefore, 'changed frame IS rebuilt');
  assert(frameElChanged.textContent.includes('999'), 'new value appears after rebuild');

  // Click the ref variable row -> heap card should get the highlight class.
  const refRow = doc.querySelector('.var-row.ref');
  refRow.dispatchEvent(new window.Event('click', { bubbles: true }));
  const heapCard = doc.getElementById('heap-100');
  assert(heapCard.classList.contains('highlight'), 'clicking ref variable highlights heap card');

  // Click the frame's line label -> should postMessage a revealLine request.
  window.__lastPostedMessage = null;
  const lineLabel = doc.querySelector('.frame-header .line');
  lineLabel.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(
    window.__lastPostedMessage &&
    window.__lastPostedMessage.type === 'revealLine' &&
    window.__lastPostedMessage.path === '/tmp/sample.py' &&
    window.__lastPostedMessage.line === 3,
    'clicking line label posts a correct revealLine message'
  );

  // Click the editable primitive value -> becomes an input; typing + blur
  // posts a setVariable message.
  window.__lastPostedMessage = null;
  const valueEls = doc.querySelectorAll('.var-row:not(.ref) .var-value');
  const editableValue = valueEls[valueEls.length - 1];
  editableValue.dispatchEvent(new window.Event('click', { bubbles: true }));
  const input = editableValue.querySelector('input');
  assert(input !== null, 'clicking primitive value creates an inline input');
  input.value = '777';
  input.dispatchEvent(new window.Event('blur'));
  assert(
    window.__lastPostedMessage &&
    window.__lastPostedMessage.type === 'setVariable' &&
    window.__lastPostedMessage.name === 'total' &&
    window.__lastPostedMessage.value === '777' &&
    window.__lastPostedMessage.containerRef === 42,
    'editing a variable posts a correct setVariable message'
  );

  // Complexity panel.
  post('complexity', {
    functionName: 'linear_search',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    sampledInputSizes: [10, 100, 1000],
    sampledOpCounts: [10, 100, 1000]
  });
  assert(doc.querySelector('.complexity-badge').textContent === 'O(n)', 'complexity panel renders time complexity');

  // Structural edit console: typing an expression + Enter posts an
  // 'evaluate' message with the right frameId and expression text.
  window.__lastPostedMessage = null;
  const consoleInput = doc.querySelector('.console-input');
  assert(consoleInput !== null, 'expression console input is rendered on the frame card');
  consoleInput.value = 'lst.append(4)';
  consoleInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert(
    window.__lastPostedMessage &&
    window.__lastPostedMessage.type === 'evaluate' &&
    window.__lastPostedMessage.frameId === 'f1' &&
    window.__lastPostedMessage.expression === 'lst.append(4)',
    'submitting an expression posts a correct evaluate message'
  );
  assert(consoleInput.value === '', 'console input clears after submit');

  // A successful evaluateResult populates the output line beneath the console.
  post('evaluateResult', { ok: true, output: '5' });
  const outputEl = doc.querySelector('.console-output');
  assert(outputEl.style.display === 'block' && outputEl.textContent.includes('5'), 'successful evaluate result is shown');
  assert(outputEl.classList.contains('ok'), 'successful result gets the ok style');

  // A failed evaluateResult shows an error-styled message.
  post('evaluateResult', { ok: false, output: "NameError: name 'zzz' is not defined" });
  assert(outputEl.classList.contains('error'), 'failed result gets the error style');
  assert(outputEl.textContent.includes('NameError'), 'failed result shows the error text');

  const stackSnapshot = JSON.parse(JSON.stringify(snapshot1));
  stackSnapshot.frames.push({
    id: 'f2',
    functionName: '<module>',
    line: 57,
    sourcePath: '/tmp/sample.py',
    variables: []
  });
  post('snapshot', stackSnapshot);
  window.switchView('mermaid');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(window.__mermaidRender.source.includes('F_1 -->|calls| F_0'), 'call arrows point from caller to callee');
  assert(window.__mermaidRender.source.includes('#lt;module#gt;'), 'angle-bracket frame names are escaped for Mermaid');

  const latexSnapshot = JSON.parse(JSON.stringify(stackSnapshot));
  latexSnapshot.heap = [{
    id: '14',
    type: 'dict',
    preview: ["'operation': 'addition'", "'inputs': [12, 8]"],
    truncated: false,
    size: 2
  }];
  post('snapshot', latexSnapshot);
  window.switchView('latex');
  assert(doc.querySelectorAll('#latex-content .katex[data-typeset="true"]').length === 4, 'complexity and stack formulas are typeset');
  assert(window.__katexCalls.some(call => call.tex.includes('T(n)')), 'time complexity is passed to KaTeX');
  assert(window.__katexCalls.some(call => call.tex.includes('Heap Reference Count')), 'heap count is passed to KaTeX');
  assert(doc.querySelector('#latex-content .latex-frame-list').textContent.includes('<module>'), 'module frame name displays literally');
  assert(!doc.querySelector('#latex-content .latex-equations').textContent.includes('\\'), 'equation area does not show raw LaTeX commands');

  const specialEdgeSnapshot = JSON.parse(JSON.stringify(snapshot1));
  specialEdgeSnapshot.heap.push({ id: '219', type: 'tuple', preview: ['0: value'], truncated: false, size: 1 });
  specialEdgeSnapshot.edges.push({ from: '(return) process_data', to: '219' });
  post('snapshot', specialEdgeSnapshot);
  window.switchView('mermaid');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(window.__mermaidRender.source.includes('F_0 -.->|"ref (return) process_data"| H_219'), 'special characters in heap edge labels are quoted for Mermaid');

  const longSnapshot = JSON.parse(JSON.stringify(snapshot1));
  const longText = 'variablecontent'.repeat(20);
  longSnapshot.frames[0].functionName = 'very_long_process_data_function_name_that_needs_wrapping';
  longSnapshot.frames[0].variables[1].value = longText;
  post('snapshot', longSnapshot);
  window.switchView('flowchart');
  const flowchart = doc.querySelector('#flowchart-container svg');
  const flowchartTexts = flowchart.querySelectorAll('.flowchart-label');
  assert(flowchart.querySelectorAll('.flowchart-label tspan').length > 2, 'long flowchart labels wrap into multiple SVG lines');
  assert(Number(flowchart.querySelector('.flowchart-node rect').getAttribute('height')) > 65, 'flowchart node grows to fit wrapped labels');
  assert(doc.defaultView.getComputedStyle(doc.body).overflow === 'auto', 'whole webview scrolls horizontally and vertically');
  assert(doc.defaultView.getComputedStyle(doc.querySelector('.flowchart-svg-wrap')).overflow === 'auto', 'diagram view supports both scroll directions');
  assert(flowchartTexts.length === 2, 'flowchart keeps title and variable summary in separate text rows');
  assert(doc.defaultView.getComputedStyle(doc.querySelector('.heap-item')).overflowX === 'auto', 'long heap entries can be scrolled horizontally');
  assert(doc.defaultView.getComputedStyle(doc.querySelector('.var-value')).overflowX === 'auto', 'long stack values can be scrolled horizontally');

  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run();
