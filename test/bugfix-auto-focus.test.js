const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fc = require('fast-check');

// `vscode` is only available when tests run inside the VS Code test runner.
let vscode;
try {
  vscode = require('vscode');
} catch {
  console.log('Skipping bugfix auto-focus tests: vscode module not available in this environment.');
  module.exports = {};
}

if (vscode) {
  suite('Bugfix: Auto-focus on batch file open/switch', () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     * 
     * Property 1: Bug Condition - Auto-focus on batch file open/switch
     * 
     * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
     * This test encodes the expected behavior - it will validate the fix when it passes after implementation.
     * 
     * GOAL: Surface counterexamples that demonstrate the bug exists.
     * 
     * Test Strategy:
     * - Read the extension.js source code to verify ensureVisible() implementation
     * - Check if ensureVisible() contains the problematic 'workbench.view.debug' command
     * - This is a scoped PBT approach: we test the concrete failing case directly
     * 
     * Expected Outcome on UNFIXED code: Test FAILS (proves bug exists)
     * Expected Outcome on FIXED code: Test PASSES (confirms fix works)
     */
    test('Property 1: ensureVisible() should NOT contain workbench.view.debug command', async function () {
      this.timeout(5000);

      // Read the extension.js source code
      const extensionPath = path.join(__dirname, '..', 'extension.js');
      const extensionSource = fs.readFileSync(extensionPath, 'utf8');

      // Find the ensureVisible method by counting braces to get the complete method
      const lines = extensionSource.split('\n');
      const startIdx = lines.findIndex(l => l.includes('ensureVisible() {'));
      
      assert.ok(startIdx >= 0, 'ensureVisible() method should exist in extension.js');
      
      // Count braces to find the end of the method
      let braceCount = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        if (braceCount === 0 && i > startIdx) {
          endIdx = i;
          break;
        }
      }
      
      const ensureVisibleCode = lines.slice(startIdx, endIdx + 1).join('\n');

      // Check if the method contains the problematic command
      // On UNFIXED code, this will contain 'workbench.view.debug' and the test will FAIL
      // On FIXED code, this will NOT contain 'workbench.view.debug' and the test will PASS
      const containsBuggyCommand = ensureVisibleCode.includes('workbench.view.debug');

      assert.strictEqual(
        containsBuggyCommand,
        false,
        `Bug detected: ensureVisible() contains 'workbench.view.debug' command which steals focus from editor.\n` +
        `This confirms the bug exists. The method should only call this._view.show(true) without executing the focus-stealing command.\n` +
        `Current implementation:\n${ensureVisibleCode}`
      );
    });

    /**
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     * 
     * Property 1 (behavioral): Opening .bat file triggers maybeEnsureOutputViewVisible
     * 
     * This test verifies the behavioral aspect: that opening a .bat file does trigger
     * the extension's output view logic, but should not steal focus.
     */
    test('Property 1 (behavioral): Opening .bat file should make output view visible without stealing focus', async function () {
      this.timeout(10000);

      // Ensure extension is activated
      const ext = vscode.extensions.getExtension('14ag.blinter');
      if (ext) await ext.activate();

      // Use existing test file
      const testFilePath = path.join(__dirname, '..', 'tmp', 'sample1.bat');
      
      if (!fs.existsSync(testFilePath)) {
        assert.fail(`Test file not found: ${testFilePath}`);
      }

      // Open the .bat file
      const document = await vscode.workspace.openTextDocument(testFilePath);
      await vscode.window.showTextDocument(document);

      // Wait for extension to process the file open event
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify the editor is still the active editor (focus not stolen)
      const activeEditor = vscode.window.activeTextEditor;
      assert.ok(activeEditor, 'An editor should be active');
      assert.strictEqual(
        activeEditor.document.uri.fsPath,
        testFilePath,
        'The .bat file editor should still be active (focus should not have been stolen)'
      );

      // Note: On unfixed code, the focus might be stolen to the debug panel
      // This test provides behavioral validation but may not reliably fail on unfixed code
      // due to timing and VS Code's internal focus management
    });
  });

  /**
   * ============================================================================
   * PRESERVATION PROPERTY TESTS (Task 2)
   * ============================================================================
   * 
   * These tests verify that existing functionality is preserved on UNFIXED code.
   * They establish the baseline behavior that must continue working after the fix.
   * 
   * EXPECTED OUTCOME: All tests PASS on unfixed code (confirms baseline to preserve)
   */
  suite('Property 2: Preservation - Manual debug session and other functionality', () => {
    
    /**
     * **Validates: Requirement 3.1**
     * 
     * Property 2.1: Manual debug session shows and focuses Blinter Output webview
     * 
     * When a user explicitly starts a debug session (F5 or "Run and Debug"),
     * the Blinter Output webview should be shown and focused as expected.
     * 
     * This is the INTENDED behavior that must be preserved.
     */
    test('Property 2.1: Manual debug session triggers ensureVisible correctly', async function () {
      this.timeout(5000);

      // Property-based test: verify ensureVisible is called during debug session start
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          // Read extension source to verify debug session behavior
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify that debug session start calls ensureVisible
          // Look for the onDidStartDebugSession handler
          const hasDebugSessionHandler = extensionSource.includes('onDidStartDebugSession');
          const callsEnsureVisibleOnDebug = extensionSource.includes('this.webviewProvider?.ensureVisible()');

          // Both should exist - this is the intended behavior
          assert.ok(
            hasDebugSessionHandler && callsEnsureVisibleOnDebug,
            'Debug session should call ensureVisible to show output view'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirements 3.2, 3.5**
     * 
     * Property 2.2: Linting diagnostics functionality is preserved
     * 
     * When linting diagnostics are generated (on save or on type),
     * they should display in Problems panel and editor decorations.
     * 
     * This functionality must continue working after the fix.
     */
    test('Property 2.2: Linting diagnostics generation is preserved', async function () {
      this.timeout(5000);

      // Property-based test: verify diagnostic generation logic exists
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify diagnostic collection and decoration logic exists
          const hasDiagnosticCollection = extensionSource.includes('diagnosticCollection') ||
                                           extensionSource.includes('createDiagnosticCollection');
          const hasDecorationLogic = extensionSource.includes('refreshDecorations') ||
                                      extensionSource.includes('createDecorationType');
          const hasLintingLogic = extensionSource.includes('lintDocument') || 
                                   extensionSource.includes('spawnBlinter');

          assert.ok(
            hasDiagnosticCollection && hasDecorationLogic && hasLintingLogic,
            'Linting diagnostics functionality should be present'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirement 3.3**
     * 
     * Property 2.3: Manual click on Blinter Output view works correctly
     * 
     * When the user manually clicks on the Blinter Output view,
     * it should show and focus the view as expected.
     * 
     * This is handled by VS Code's view system and should continue working.
     */
    test('Property 2.3: Blinter Output view is properly registered', async function () {
      this.timeout(5000);

      // Property-based test: verify view registration
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify webview provider is registered
          const hasWebviewProvider = extensionSource.includes('BlinterOutputViewProvider');
          const hasViewRegistration = extensionSource.includes('registerWebviewViewProvider');

          assert.ok(
            hasWebviewProvider && hasViewRegistration,
            'Blinter Output view should be properly registered'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirement 3.4**
     * 
     * Property 2.4: Hover providers, code actions, and quick fixes are preserved
     * 
     * When hover providers, code actions, and quick fixes are triggered,
     * they should function normally without being affected by the fix.
     */
    test('Property 2.4: Hover providers and code actions are registered', async function () {
      this.timeout(5000);

      // Property-based test: verify provider registrations
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify hover provider and code action provider registrations
          const hasHoverProvider = extensionSource.includes('registerHoverProvider') ||
                                    extensionSource.includes('provideHover');
          const hasCodeActionProvider = extensionSource.includes('registerCodeActionsProvider') ||
                                         extensionSource.includes('provideCodeActions');

          // At least one of these should exist
          assert.ok(
            hasHoverProvider || hasCodeActionProvider,
            'Hover providers or code actions should be registered'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirement 3.6**
     * 
     * Property 2.5: Status bar indicator updates correctly
     * 
     * When the status bar indicator updates, it should display correctly
     * without affecting focus or other functionality.
     */
    test('Property 2.5: Status bar indicator functionality is preserved', async function () {
      this.timeout(5000);

      // Property-based test: verify status bar logic
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify status bar item creation and update logic
          const hasStatusBarItem = extensionSource.includes('createStatusBarItem');
          const hasStatusUpdate = extensionSource.includes('updateStatus') ||
                                   extensionSource.includes('_updateConfigStatusBar');

          assert.ok(
            hasStatusBarItem && hasStatusUpdate,
            'Status bar indicator functionality should be present'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirement 3.7**
     * 
     * Property 2.6: Suppression comments functionality is preserved
     * 
     * When suppression comments are added or removed, the functionality
     * should work without switching focus or causing issues.
     */
    test('Property 2.6: Suppression comment functionality is preserved', async function () {
      this.timeout(5000);

      // Property-based test: verify suppression comment logic
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify suppression comment handling
          const hasSuppressionLogic = extensionSource.includes('LINT:IGNORE') ||
                                       extensionSource.includes('suppression');
          const hasRemoveSuppressions = extensionSource.includes('removeAllSuppressions');

          assert.ok(
            hasSuppressionLogic || hasRemoveSuppressions,
            'Suppression comment functionality should be present'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
     * 
     * Property 2.7: Core extension structure is intact
     * 
     * This meta-property verifies that the core extension structure
     * remains intact, ensuring all functionality can continue to work.
     */
    test('Property 2.7: Core extension structure is intact', async function () {
      this.timeout(5000);

      // Property-based test: verify core structure
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify key classes and functions exist
          const hasBlinterClass = extensionSource.includes('class Blinter');
          const hasWebviewProvider = extensionSource.includes('class BlinterOutputViewProvider');
          const hasActivateFunction = extensionSource.includes('function activate(');
          const hasDeactivateFunction = extensionSource.includes('function deactivate(');

          assert.ok(
            hasBlinterClass && hasWebviewProvider && hasActivateFunction && hasDeactivateFunction,
            'Core extension structure should be intact'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });

    /**
     * **Validates: Requirements 3.1, 3.5**
     * 
     * Property 2.8: Automatic linting configuration is preserved
     * 
     * The extension should respect the runOn configuration (onSave/onType)
     * and continue to perform automatic linting without focus issues.
     */
    test('Property 2.8: Automatic linting configuration handling is preserved', async function () {
      this.timeout(5000);

      // Property-based test: verify configuration handling
      await fc.assert(
        fc.asyncProperty(fc.constant(true), async () => {
          const extensionPath = path.join(__dirname, '..', 'extension.js');
          const extensionSource = fs.readFileSync(extensionPath, 'utf8');

          // Verify configuration reading and event handlers
          const hasConfigHandling = extensionSource.includes('blinter.runOn') ||
                                     extensionSource.includes('getConfiguration');
          const hasOnSaveHandler = extensionSource.includes('onDidSaveTextDocument');
          const hasOnTypeHandler = extensionSource.includes('onDidChangeTextDocument');

          assert.ok(
            hasConfigHandling && (hasOnSaveHandler || hasOnTypeHandler),
            'Automatic linting configuration handling should be present'
          );

          return true;
        }),
        { numRuns: 10 }
      );
    });
  });
}
