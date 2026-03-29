const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
  let panel = null;
  let currentEditor = null;
  let suppressEditorSync = false;

  // Command: Open Preview
  const previewCmd = vscode.commands.registerCommand('stablestate.preview', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'stablestate') return;
    currentEditor = editor;

    if (panel) { panel.reveal(); return; }

    panel = vscode.window.createWebviewPanel(
      'stablestatePreview',
      'StableState Preview',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = getWebviewContent(context, editor.document.getText());

    // Editor -> Webview sync
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(e => {
      if (suppressEditorSync) return;
      if (currentEditor && e.document === currentEditor.document && panel) {
        panel.webview.postMessage({ type: 'dslUpdate', dsl: e.document.getText() });
      }
    });

    // Track active editor changes
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(e => {
      if (e && e.document.languageId === 'stablestate') {
        currentEditor = e;
        if (panel) {
          panel.webview.postMessage({ type: 'dslUpdate', dsl: e.document.getText() });
        }
      }
    });

    // Webview -> Editor sync
    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'dslUpdate' && currentEditor) {
        suppressEditorSync = true;
        try {
          const edit = new vscode.WorkspaceEdit();
          const doc = currentEditor.document;
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          edit.replace(doc.uri, fullRange, msg.dsl);
          await vscode.workspace.applyEdit(edit);
        } finally {
          suppressEditorSync = false;
        }
      }
      if (msg.type === 'exportSVG' || msg.type === 'exportPNG') {
        const ext = msg.type === 'exportSVG' ? 'svg' : 'png';
        const uri = await vscode.window.showSaveDialog({
          filters: { [ext.toUpperCase()]: [ext] },
          defaultUri: vscode.Uri.file(`stablestate.${ext}`)
        });
        if (uri) {
          const data = Buffer.from(msg.data, 'base64');
          await vscode.workspace.fs.writeFile(uri, data);
          vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
        }
      }
      if (msg.type === 'info') {
        vscode.window.showInformationMessage(msg.text);
      }
    });

    // Set context key for keybindings
    panel.onDidChangeViewState(e => {
      vscode.commands.executeCommand('setContext', 'stablestatePreviewFocused', e.webviewPanel.active);
    });
    vscode.commands.executeCommand('setContext', 'stablestatePreviewFocused', true);

    panel.onDidDispose(() => {
      panel = null;
      vscode.commands.executeCommand('setContext', 'stablestatePreviewFocused', false);
      docChangeDisposable.dispose();
      editorChangeDisposable.dispose();
    });

    context.subscriptions.push(docChangeDisposable, editorChangeDisposable);
  });

  // Export commands
  const exportSvgCmd = vscode.commands.registerCommand('stablestate.exportSVG', () => {
    if (panel) panel.webview.postMessage({ type: 'exportSVG' });
  });
  const exportPngCmd = vscode.commands.registerCommand('stablestate.exportPNG', () => {
    if (panel) panel.webview.postMessage({ type: 'exportPNG' });
  });

  // ADR-001: Shortcut forwarding commands
  const fwdCommands = ['undo', 'redo', 'copy', 'cut', 'paste', 'selectAll'];
  const fwdDisposables = fwdCommands.map(cmd =>
    vscode.commands.registerCommand(`stablestate.${cmd}`, () => {
      if (panel) panel.webview.postMessage({ type: cmd });
    })
  );

  // Visual Diff command
  const diffCmd = vscode.commands.registerCommand('stablestate.diffPreview', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    if (!doc.fileName.match(/\.sstate$/)) return;
    const currentText = doc.getText();
    try {
      const cp = require('child_process');
      const dir = path.dirname(doc.uri.fsPath);
      const rel = path.relative(dir, doc.uri.fsPath).replace(/\\/g, '/');
      const headText = cp.execSync(`git show HEAD:${rel}`, { cwd: dir, encoding: 'utf-8' });
      const diffPanel = vscode.window.createWebviewPanel(
        'stablestateDiff', 'StableState Diff', vscode.ViewColumn.Active,
        { enableScripts: true }
      );
      diffPanel.webview.html = getDiffContent(headText, currentText);
    } catch (e) {
      vscode.window.showWarningMessage('No git history found for this file');
    }
  });

  context.subscriptions.push(previewCmd, exportSvgCmd, exportPngCmd, diffCmd, ...fwdDisposables);
}

function getDiffContent(oldDsl, newDsl) {
  const oldJson = JSON.stringify(oldDsl);
  const newJson = JSON.stringify(newDsl);
  return `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;display:flex;flex-direction:column;height:100vh}
.header{padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #444;display:flex;gap:20px}
.header span{color:#888}
.container{display:flex;flex:1;overflow:auto}
.pane{flex:1;padding:8px;overflow:auto;border-right:1px solid #333}
.pane:last-child{border-right:none}
.label{font-size:11px;font-weight:700;padding:4px 8px;margin-bottom:4px}
.old .label{color:#f87171}
.new .label{color:#34d399}
</style></head><body>
<div class="header"><span>StableState Visual Diff</span><span>HEAD (left) vs Current (right)</span></div>
<div class="container">
<div class="pane old"><div class="label">HEAD</div><div id="old-svg"></div></div>
<div class="pane new"><div class="label">Current</div><div id="new-svg"></div></div>
</div>
<script>
function esc(t){return t?t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"):""}
function parseMini(t){
  var ls=t.split("\\n"),cv={width:960,height:600,grid:20},st=[],ps=[],gr=[],tr=[];
  for(var i=0;i<ls.length;i++){
    var r=ls[i].trim();if(!r||r[0]==='#')continue;
    if(r.startsWith("@canvas")){var w=r.match(/width=(\\d+)/),h=r.match(/height=(\\d+)/),g=r.match(/grid=(\\d+)/);if(w)cv.width=+w[1];if(h)cv.height=+h[1];if(g)cv.grid=+g[1];continue;}
    var m=r.match(/^state\\s+(\\S+)\\s+"([^"]*)"\\s+at\\s+([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s+size\\s+([\\d.]+)\\s*x\\s*([\\d.]+))?/);
    if(m){st.push({id:m[1],label:m[2],x:+m[3],y:+m[4],w:+(m[5]||8),h:+(m[6]||4)});continue;}
    m=r.match(/^(initial|final|choice)\\s+(\\S+)\\s+at\\s+([\\d.]+)\\s*,\\s*([\\d.]+)/);
    if(m){ps.push({type:m[1],id:m[2],x:+m[3],y:+m[4]});continue;}
    m=r.match(/^group\\s+(\\S+)\\s+"([^"]*)"\\s+at\\s+([\\d.]+)\\s*,\\s*([\\d.]+)\\s+size\\s+([\\d.]+)\\s*x\\s*([\\d.]+)/);
    if(m){gr.push({id:m[1],label:m[2],x:+m[3],y:+m[4],w:+m[5],h:+m[6]});continue;}
    m=r.match(/^(\\S+)\\s*->\\s*(\\S+)/);
    if(m){tr.push({from:m[1],to:m[2]});continue;}
  }
  return{canvas:cv,states:st,pseudos:ps,groups:gr,transitions:tr};
}
function renderDiffSVG(p,other){
  var g=p.canvas.grid,otherIds=new Set();
  other.states.forEach(function(s){otherIds.add(s.id)});
  other.pseudos.forEach(function(s){otherIds.add(s.id)});
  var svg='<svg width="100%" viewBox="0 0 '+p.canvas.width+' '+p.canvas.height+'" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a;border-radius:4px">';
  var sm={};
  p.states.forEach(function(s){sm[s.id]=s});
  p.pseudos.forEach(function(ps){sm[ps.id]={x:ps.x,y:ps.y,w:1,h:1}});
  // Groups
  p.groups.forEach(function(x){svg+='<rect x="'+(x.x*g)+'" y="'+(x.y*g)+'" width="'+(x.w*g)+'" height="'+(x.h*g)+'" fill="rgba(99,102,241,0.08)" stroke="#6366F1" stroke-width="0.5" rx="4"/>';svg+='<text x="'+(x.x*g+4)+'" y="'+(x.y*g+10)+'" font-size="8" fill="#888">'+esc(x.label)+'</text>'});
  // Transitions
  p.transitions.forEach(function(t){var a=sm[t.from],b=sm[t.to];if(!a||!b)return;var x1=a.x*g+a.w*g/2,y1=a.y*g+a.h*g/2,x2=b.x*g+b.w*g/2,y2=b.y*g+b.h*g/2;svg+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#64748B" stroke-width="0.8"/>'});
  // States with diff coloring
  p.states.forEach(function(s){
    var isNew=!otherIds.has(s.id);
    var fill=isNew?'#22C55E':'#818CF8';
    var sw=isNew?2:0.5;
    svg+='<rect x="'+(s.x*g)+'" y="'+(s.y*g)+'" width="'+(s.w*g)+'" height="'+(s.h*g)+'" fill="#1e293b" stroke="'+fill+'" stroke-width="'+sw+'" rx="6"/>';
    svg+='<text x="'+(s.x*g+s.w*g/2)+'" y="'+(s.y*g+s.h*g/2+3)+'" font-size="9" fill="#e0e0e0" text-anchor="middle">'+esc(s.label)+'</text>';
  });
  // Pseudos
  p.pseudos.forEach(function(ps){
    var cx=ps.x*g,cy=ps.y*g;
    if(ps.type==='initial')svg+='<circle cx="'+cx+'" cy="'+cy+'" r="6" fill="#e0e0e0"/>';
    else if(ps.type==='final'){svg+='<circle cx="'+cx+'" cy="'+cy+'" r="8" fill="none" stroke="#e0e0e0" stroke-width="1.5"/>';svg+='<circle cx="'+cx+'" cy="'+cy+'" r="4" fill="#e0e0e0"/>';}
    else if(ps.type==='choice')svg+='<polygon points="'+cx+','+(cy-6)+' '+(cx+6)+','+cy+' '+cx+','+(cy+6)+' '+(cx-6)+','+cy+'" fill="#1e293b" stroke="#818CF8" stroke-width="1"/>';
  });
  // Mark removed elements (in other but not in this)
  other.states.forEach(function(s){
    if(!sm[s.id]){svg+='<rect x="'+(s.x*g)+'" y="'+(s.y*g)+'" width="'+(s.w*g)+'" height="'+(s.h*g)+'" fill="none" stroke="#EF4444" stroke-width="2" stroke-dasharray="4,2" rx="6"/>';svg+='<text x="'+(s.x*g+s.w*g/2)+'" y="'+(s.y*g+s.h*g/2+3)+'" font-size="9" fill="#EF4444" text-anchor="middle" opacity="0.6">'+esc(s.label)+'</text>';}
  });
  svg+='</svg>';return svg;
}
var oldP=parseMini(${oldJson}),newP=parseMini(${newJson});
document.getElementById('old-svg').innerHTML=renderDiffSVG(oldP,newP);
document.getElementById('new-svg').innerHTML=renderDiffSVG(newP,oldP);
</script></body></html>`;
}

function getWebviewContent(context, initialDsl) {
  const htmlPath = path.join(context.extensionPath, 'stablestate.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace('__INITIAL_DSL__', JSON.stringify(initialDsl));
  return html;
}

function deactivate() {}

module.exports = { activate, deactivate };
