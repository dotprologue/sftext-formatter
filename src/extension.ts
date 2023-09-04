// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { stringify } from 'querystring';
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sftext-formatter" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.languages.registerDocumentFormattingEditProvider('sftext', {
		provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			//First formatting
			const verticalBarRegex = /^(.*?)(\|)(.*)$/;
			const halfWidthRegex = /[\x01-\x7E\uFF65-\uFF9F]/; 
			const textInfoArray = [...Array(document.lineCount)]
			.map((_, index) => index)
			.map(index => document.lineAt(index))
			.map(t =>{
				const matches = verticalBarRegex.exec(t.text);
				if (matches === null) {
					return {
						text: t.text,
						halfChar: 0,
						fullChar: 0,
					}
				}
				else {
					const trimedScopePart = matches[1].trim();
					return {
						text: `${trimedScopePart}${matches[2]} ${matches[3].trim()}`,
						halfChar: [...trimedScopePart]
						.filter(c => halfWidthRegex.test(c))
						.length,
						fullChar: [...trimedScopePart]
						.filter(c => !halfWidthRegex.test(c))
						.length,
					}
				}
			});
			//Compute half-width and full-width
			const maxHalfChar = textInfoArray
			.map(info => info.halfChar)
			.reduce((a, b) => Math.max(a, b)) + 1;
			const maxFullChar = textInfoArray
			.map(info => info.fullChar)
			.reduce((a, b) => Math.max(a, b));
			//Second formatting
			const fixedTextArray = textInfoArray
			.map(info => {
				const barIndex = info.text.indexOf("|");
				if (barIndex === -1) {
					return info.text;
				} else {
					const halfWhitespaces = " ".repeat(maxHalfChar - info.halfChar);
					const fullWhiteSpaces = "　".repeat(maxFullChar - info.fullChar);
					return `${info.text.slice(0, barIndex)}${halfWhitespaces}${fullWhiteSpaces}${info.text.slice(barIndex, info.text.length)}`
				}
			})
			//Reflect results
			return [...Array(document.lineCount)]
			.map((_, index) => index)
			.map(index => vscode.TextEdit.replace(document.lineAt(index).range,fixedTextArray[index]));
		}
	  });

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}