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

  context.subscriptions.push(previewCmd, exportSvgCmd, exportPngCmd, ...fwdDisposables);
}

function getWebviewContent(context, initialDsl) {
  // Read the webview HTML template
  const htmlPath = path.join(context.extensionPath, 'src', 'webview.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Inject the initial DSL as a JSON-encoded string
  html = html.replace('__INITIAL_DSL__', JSON.stringify(initialDsl));

  return html;
}

function deactivate() {}

module.exports = { activate, deactivate };
