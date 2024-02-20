// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { format } from 'path';
import { stringify } from 'querystring';
import { start } from 'repl';
import * as vscode from 'vscode';

let halfWidthRegex: RegExp

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('sftext', {
		provideDocumentFormattingEdits: document => {
			//Get half width character regex from the configuration
			const configuration = vscode.workspace.getConfiguration("SFText Formatter");
			const halfWidthCharacterList = configuration.get("halfWidthCharacterList") as string;
			halfWidthRegex = new RegExp(`[${halfWidthCharacterList}]`);
			//First formatting
			//Split each of the texts to the three parts
			const verticalBarRegex = /^(.*?)(\|)(.*?)(\|)(.*)$/;
			const textInfoArray = [...Array(document.lineCount)]
				.map((_, index) => index)
				.map(index => document.lineAt(index))
				.map(t => t.text)
				.map(t => {
					const matches = verticalBarRegex.exec(t);
					const verticalBarIndex = t.indexOf('|');
					//Text that doesn't have any vertical bars
					if (verticalBarIndex == -1) {
						return {
							scopePart: t.trim(),
							contentPart: "",
							commentPart: ""
						}
					}
					//Text that have only single vertical bar
					else if (matches === null) {
						return {
							scopePart: t.slice(0, verticalBarIndex).trim(),
							contentPart: t.slice(verticalBarIndex + 1, t.length).trim(),
							commentPart: ""
						}
					}
					//Text that matches with the regex completely
					else {
						//Split the text to the three parts
						return {
							scopePart: matches[1].trim(),
							contentPart: matches[3].trim(),
							commentPart: matches[5].trim()
						}
					}
				})
				.map(info => {
					return {
						scopePart: info.scopePart,
						scopeHalf: getHalfCharCount(info.scopePart),
						scopeFull: getFullCharCount(info.scopePart),
						contentPart: info.contentPart,
						contentHalf: getHalfCharCount(info.contentPart),
						contentFull: getFullCharCount(info.contentPart),
						commentPart: info.commentPart
					}
				});
			//Compute each of max half-width and full-width in each of scope and content part
			const maxScopeHalf = textInfoArray
				.map(info => info.scopeHalf)
				.reduce((a, b) => Math.max(a, b));
			const maxScopeFull = textInfoArray
				.map(info => info.scopeFull)
				.reduce((a, b) => Math.max(a, b));
			const maxContentHalf = textInfoArray
				.map(info => info.contentHalf)
				.reduce((a, b) => Math.max(a, b));
			const maxContentFull = textInfoArray
				.map(info => info.contentFull)
				.reduce((a, b) => Math.max(a, b));
			//Second formatting
			//Unify each of the texts
			const extraSpaceInfoArray = textInfoArray
				.map(info => {
					return {
						scopeHalfSpace: maxScopeHalf - info.scopeHalf,
						scopeFullSpace: maxScopeFull - info.scopeFull,
						contentHalfSpace: maxContentHalf - info.contentHalf,
						contentFullSpace: maxContentFull - info.contentFull
					}
				});

			//1 unit
			const halfConstant = 20;
			const fullConstant = 11;

			const minScopeUnit = extraSpaceInfoArray
				.map(info => quotient(info.scopeHalfSpace, halfConstant) + quotient(info.scopeFullSpace, fullConstant))
				.reduce((a, b) => Math.min(a, b));
			const minContentUnit = extraSpaceInfoArray
				.map(info => quotient(info.contentHalfSpace, halfConstant) + quotient(info.contentFullSpace, fullConstant))
				.reduce((a, b) => Math.min(a, b));

			const fixedTextArray = textInfoArray
				.map(info => {
					let scopeRemovableUnit = minScopeUnit;
					let scopeHalfSpace = maxScopeHalf - info.scopeHalf;
					let scopeFullSpace = maxScopeFull - info.scopeFull;
					let contentRemovableUnit = minContentUnit;
					let contentHalfSpace = maxContentHalf - info.contentHalf;
					let contentFullSpace = maxContentFull - info.contentFull;
					//Remove full whitespaces in scope
					const scopeFullUnit = quotient(scopeFullSpace, fullConstant);
					if (scopeFullUnit > 0 && scopeRemovableUnit > 0) {
						if (scopeFullUnit <= scopeRemovableUnit) {
							scopeFullSpace -= fullConstant * scopeFullUnit;
							scopeRemovableUnit -= scopeFullUnit;
						}
						else {
							scopeFullSpace -= fullConstant * scopeRemovableUnit;
							scopeRemovableUnit = 0;
						}
					}
					//Remove half whitespaces in scope
					const scopeHalfUnit = quotient(scopeHalfSpace, halfConstant);
					if (scopeHalfUnit && scopeRemovableUnit > 0) {
						if (scopeHalfUnit <= scopeRemovableUnit) {
							scopeHalfSpace -= halfConstant * scopeHalfUnit;
							scopeRemovableUnit -= scopeHalfUnit;
						}
						else {
							scopeHalfSpace -= halfConstant * scopeRemovableUnit;
							scopeRemovableUnit = 0;
						}
					}
					//Remove full whitespaces in scope
					const contentFullUnit = quotient(contentFullSpace, fullConstant);
					if (contentFullUnit > 0 && contentRemovableUnit > 0) {
						if (contentFullUnit <= contentRemovableUnit) {
							contentFullSpace -= fullConstant * contentFullUnit;
							contentRemovableUnit -= contentFullUnit;
						}
						else {
							contentFullSpace -= fullConstant * contentRemovableUnit;
							contentRemovableUnit = 0;
						}
					}
					//Remove half whitespaces in scope
					const contentHalfUnit = quotient(contentHalfSpace, halfConstant);
					if (contentHalfUnit && contentRemovableUnit > 0) {
						if (contentHalfUnit <= contentRemovableUnit) {
							contentHalfSpace -= halfConstant * contentHalfUnit;
							contentRemovableUnit -= contentHalfUnit;
						}
						else {
							contentHalfSpace -= halfConstant * contentRemovableUnit;
							contentRemovableUnit = 0;
						}
					}
					const scopeWhite = `${"　".repeat(scopeFullSpace)}${" ".repeat(scopeHalfSpace)}`
					const contentWhite = `${"　".repeat(contentFullSpace)}${" ".repeat(contentHalfSpace)}`;
					return `${info.scopePart}${scopeWhite} | ${info.contentPart}${contentWhite} | ${info.commentPart}`;
				})

			return [...Array(document.lineCount)]
				.map((_, index) => index)
				.map(index => vscode.TextEdit.replace(document.lineAt(index).range, fixedTextArray[index]));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('sftext-helloworld', () => {
		vscode.window.showInformationMessage("Hello, world!");

		const { activeTextEditor } = vscode.window;
		if (activeTextEditor && activeTextEditor.document.languageId === 'sftext') {
			const { document } = activeTextEditor;
		}
	}));
}

function quotient(a: number, b: number) {
	return Math.floor(a / b);
}

function getHalfCharCount(text: string): number {
	return [...text]
		.filter(c => halfWidthRegex.test(c))
		.length;
}

function getFullCharCount(text: string): number {
	return [...text]
		.filter(c => !halfWidthRegex.test(c))
		.length;
}

// This method is called when your extension is deactivated
export function deactivate() { }