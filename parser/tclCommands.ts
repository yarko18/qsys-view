// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

export interface TclCommand {
  name: string;
  words: string[];
  line: number;
}

function splitCommands(script: string): Array<{ text: string; line: number }> {
  const commands: Array<{ text: string; line: number }> = [];
  let current = '';
  let line = 1;
  let commandLine = 1;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quoted = false;
  let escaped = false;
  let comment = false;
  let hasContent = false;

  const finish = () => {
    const text = current.trim();
    if (text) commands.push({ text, line: commandLine });
    current = '';
    hasContent = false;
    comment = false;
  };

  for (let index = 0; index < script.length; index++) {
    const character = script[index]!;
    if (comment) {
      if (character === '\n') {
        finish();
        line++;
        commandLine = line;
      }
      continue;
    }
    if (!hasContent && character === '#') {
      comment = true;
      continue;
    }
    if (escaped) {
      current += character;
      escaped = false;
      if (character === '\n') line++;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      hasContent = true;
      continue;
    }
    if (character === '"' && braceDepth === 0) quoted = !quoted;
    if (!quoted) {
      if (character === '{') braceDepth++;
      else if (character === '}' && braceDepth > 0) braceDepth--;
      else if (braceDepth === 0 && character === '[') bracketDepth++;
      else if (braceDepth === 0 && character === ']' && bracketDepth > 0) bracketDepth--;
    }
    const separator = !quoted && braceDepth === 0 && bracketDepth === 0
      && (character === '\n' || character === ';');
    if (separator) {
      finish();
      if (character === '\n') line++;
      commandLine = line;
      continue;
    }
    current += character;
    if (!/\s/.test(character)) {
      if (!hasContent) commandLine = line;
      hasContent = true;
    }
    if (character === '\n') line++;
  }
  finish();
  return commands;
}

function decodeEscapes(value: string): string {
  return value.replace(/\\([\\nrt" ])/g, (_match, escaped: string) => {
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 't') return '\t';
    return escaped;
  });
}

function tokenize(command: { text: string; line: number }): TclCommand | undefined {
  const words: string[] = [];
  const value = command.text;
  let index = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? '')) index++;
    if (index >= value.length) break;
    const start = value[index];
    if (start === '{') {
      let depth = 1;
      let word = '';
      index++;
      while (index < value.length && depth > 0) {
        const character = value[index]!;
        const next = value[index + 1];
        if (character === '\\' && next !== undefined) {
          word += character + next;
          index += 2;
          continue;
        }
        if (character === '{') depth++;
        if (character === '}') depth--;
        if (depth > 0) word += character;
        index++;
      }
      if (depth !== 0) throw new Error(`Invalid Qsys Tcl at line ${command.line}: unmatched brace.`);
      words.push(word);
      continue;
    }
    if (start === '"') {
      let word = '';
      let closed = false;
      index++;
      while (index < value.length) {
        const character = value[index]!;
        const next = value[index + 1];
        if (character === '\\' && next !== undefined) {
          word += character + next;
          index += 2;
          continue;
        }
        if (character === '"') {
          closed = true;
          index++;
          break;
        }
        word += character;
        index++;
      }
      if (!closed) throw new Error(`Invalid Qsys Tcl at line ${command.line}: unmatched quote.`);
      words.push(decodeEscapes(word));
      continue;
    }
    let word = '';
    while (index < value.length && !/\s/.test(value[index]!)) {
      const character = value[index]!;
      const next = value[index + 1];
      if (character === '\\' && next !== undefined) {
        word += character + next;
        index += 2;
      } else {
        word += character;
        index++;
      }
    }
    words.push(decodeEscapes(word));
  }
  const [name, ...args] = words;
  return name ? { name, words: args, line: command.line } : undefined;
}

export function parseTclCommands(script: string): TclCommand[] {
  return splitCommands(script).map(tokenize).filter((command): command is TclCommand => Boolean(command));
}
