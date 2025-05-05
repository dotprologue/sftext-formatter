// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { error } from 'console';
import { format, parse } from 'path';
import { config } from 'process';
import { stringify } from 'querystring';
import { start } from 'repl';
import internal = require('stream');
import { text } from 'stream/consumers';
import * as vscode from 'vscode';

type LineElementLength = {
	blockCount: number
	halfCharRemainder: number,
	fullCharRemainder: number
};

type LineElement = {
	text: string,
	length: LineElementLength
};

type ParsedLine = {
	annotationPart: LineElement,
	declaratorPart: LineElement,
	contentPart: LineElement,
	comment: string
};

function getMaxLineLength(lineLengths: Array<LineElementLength>): LineElementLength {
	return lineLengths.reduce((acc, val) => {
		return {
			blockCount: Math.max(acc.blockCount, val.blockCount),
			halfCharRemainder: Math.max(acc.halfCharRemainder, val.halfCharRemainder),
			fullCharRemainder: Math.max(acc.fullCharRemainder, val.fullCharRemainder)
		};
	}, {
		blockCount: 0,
		halfCharRemainder: 0,
		fullCharRemainder: 0
	});
}

function subtract(a: LineElementLength, b: LineElementLength): LineElementLength {
	return {
		blockCount: a.blockCount - b.blockCount,
		halfCharRemainder: a.halfCharRemainder - b.halfCharRemainder,
		fullCharRemainder: a.fullCharRemainder - b.fullCharRemainder
	};
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('sftext', {
		provideDocumentFormattingEdits: document => {
			// Determine what characters are half width
			const configuration = vscode.workspace.getConfiguration("SFText Formatter");
			const halfWidthCharacterList = configuration.get("halfWidthCharacterList") as string;
			const halfWidthConstant = configuration.get("halfWidthConstant") as number;
			const fullWidthConstant = configuration.get("fullWidthConstant") as number;

			const halfWidthRegex = new RegExp(`[${halfWidthCharacterList}]`);
			const emptyLineElement: LineElement = {
				text: "",
				length: {
					blockCount: 0,
					halfCharRemainder: 0,
					fullCharRemainder: 0
				}
			};
			// Parse each line
			const splitLines: Array<Array<string>> = [...Array(document.lineCount)]
				.map((_, index) => document.lineAt(index).text)
				.map(t => t.split('|'));
			const annotationExists = splitLines.some(elems => elems.length > 3);
			const commentBoundary = annotationExists ? 3 : 2;
			const parsedLines: Array<ParsedLine> = splitLines
				.map(elems => elems.map((e, i) => i < commentBoundary ? e.trim() : e))
				.map(elems => {
					const length = elems.length;
					const parsedText: ParsedLine = annotationExists ? {
						annotationPart: length > 0 ? getLineElement(elems[0], halfWidthRegex) : emptyLineElement,
						declaratorPart: length > 1 ? getLineElement(elems[1], halfWidthRegex) : emptyLineElement,
						contentPart: length > 2 ? getLineElement(elems[2], halfWidthRegex) : emptyLineElement,
						comment: length > 3 ? elems.slice(3, length).reduce((prev, curr, index) => index === 0 ? curr : `${prev}|${curr}`, "").trim() : ""
					} : {
						annotationPart: emptyLineElement,
						declaratorPart: length > 0 ? getLineElement(elems[0], halfWidthRegex) : emptyLineElement,
						contentPart: length > 1 ? getLineElement(elems[1], halfWidthRegex) : emptyLineElement,
						comment: length > 2 ? elems.slice(2, length).reduce((prev, curr, index) => index === 0 ? curr : `${prev}|${curr}`, "").trim() : ""
					};
					return parsedText;
				});
			// Get the maximum length of every line element
			const maxAnnotationLineLength = getMaxLineLength(parsedLines.map(line => line.annotationPart.length));
			const maxDeclaratorLineLength = getMaxLineLength(parsedLines.map(line => line.declaratorPart.length));
			const maxContentLineLength = getMaxLineLength(parsedLines.map(line => line.contentPart.length));
			// Align lines
			const alignedLines: Array<string> = parsedLines
				.map(line => {
					const annotationDiff = subtract(maxAnnotationLineLength, line.annotationPart.length);
					const declaratorDiff = subtract(maxDeclaratorLineLength, line.declaratorPart.length);
					const contentDiff = subtract(maxContentLineLength, line.contentPart.length);
					const alignedAnnotation = alignText(line.annotationPart.text, annotationDiff);
					const alignedDeclarator = alignText(line.declaratorPart.text, declaratorDiff);
					const alignedContent = alignText(line.contentPart.text, contentDiff);
					const alignedLine = annotationExists ?
						`${alignedAnnotation} | ${alignedDeclarator} | ${alignedContent} | ${line.comment}` :
						`${alignedDeclarator} | ${alignedContent} | ${line.comment}`;
					return alignedLine;
				});
			return [...Array(document.lineCount)]
				.map((_, index) => index)
				.filter(index => document.lineAt(index).text !== alignedLines[index])
				.map(index => vscode.TextEdit.replace(document.lineAt(index).range, alignedLines[index]));

			function getLineElement(text: string, halfWidthRegex: RegExp): LineElement {
				const classifiedChars = [...text].map(c => halfWidthRegex.test(c));
				const halfCharCount = classifiedChars.filter(isHalf => isHalf).length;
				const fullCharCount = classifiedChars.filter(isHalf => !isHalf).length;
				return {
					text: text,
					length: {
						blockCount: Math.floor(halfCharCount / halfWidthConstant) + Math.floor(fullCharCount / fullWidthConstant),
						halfCharRemainder: halfCharCount % halfWidthConstant,
						fullCharRemainder: fullCharCount % fullWidthConstant
					}
				};
			}

			function alignText(text: string, diffLength: LineElementLength): string {
				const halfWhitespaces = " ".repeat(halfWidthConstant * diffLength.blockCount + diffLength.halfCharRemainder);
				const fullWhitespaces = "　".repeat(diffLength.fullCharRemainder);
				return `${text}${halfWhitespaces}${fullWhitespaces}`;
			}
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() { }