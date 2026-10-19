import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
import { IDENTITY_QUESTION_TITLES } from '../shared/identity-questions.js';
const extensions = inlineEditorExtensions(),
  schema = getSchema(extensions),
  manager = new MarkdownManager({
    extensions
  });
const p = (text, marks, blockColor) => ({
  type: 'paragraph',
  ...(blockColor ? {
    attrs: {
      blockColor
    }
  } : {}),
  content: text ? [{
    type: 'text',
    text,
    ...(marks ? {
      marks
    } : {})
  }] : []
});
const bullet = text => ({
  type: 'bulletList',
  content: [{
    type: 'listItem',
    content: [p(text)]
  }]
});
const first = [p('Lead first', [{
  type: 'bold'
}]), {
  type: 'bulletList',
  attrs: {
    blockColor: 'green'
  },
  content: [{
    type: 'listItem',
    content: [p('List one', [{
      type: 'bold'
    }, {
      type: 'inlineStyle',
      attrs: {
        color: 'red',
        background: 'yellow'
      }
    }])]
  }, {
    type: 'listItem',
    content: [p('List two'), {
      type: 'orderedList',
      attrs: {
        start: 3,
        type: 'i'
      },
      content: [{
        type: 'listItem',
        content: [p('Ordered child', [{
          type: 'italic'
        }])]
      }]
    }]
  }]
}, {
  type: 'table',
  attrs: {
    headerRow: true,
    headerColumn: false
  },
  content: [{
    type: 'tableRow',
    content: [{
      type: 'tableHeader',
      attrs: {
        colspan: 2,
        colwidth: [140, 180],
        align: 'center',
        blockColor: 'yellow_background'
      },
      content: [p('Merged header', [{
        type: 'bold'
      }])]
    }]
  }, {
    type: 'tableRow',
    content: [{
      type: 'tableCell',
      attrs: {
        colwidth: [140],
        align: 'center'
      },
      content: [p('Literal  cell\ntext ', [{
        type: 'code'
      }]), bullet('Cell child')]
    }, {
      type: 'tableCell',
      attrs: {
        colwidth: [180],
        align: 'left',
        blockColor: 'blue_background'
      },
      content: [p('Right cell')]
    }]
  }]
}];
const second = [{
  type: 'details',
  attrs: {
    open: false,
    blockColor: 'purple_background'
  },
  content: [{
    type: 'detailsSummary',
    content: [{
      type: 'text',
      text: 'Closed summary',
      marks: [{
        type: 'bold'
      }]
    }]
  }, {
    type: 'detailsContent',
    content: [p('Hidden  detail\ntext ', [{
      type: 'underline'
    }])]
  }]
}, {
  type: 'columns',
  content: [{
    type: 'column',
    attrs: {
      width: 1.4
    },
    content: [p('Column left', [{
      type: 'italic'
    }, {
      type: 'inlineStyle',
      attrs: {
        color: 'red'
      }
    }])]
  }, {
    type: 'column',
    attrs: {
      width: .6
    },
    content: [{
      type: 'taskList',
      content: [{
        type: 'taskItem',
        attrs: {
          checked: true
        },
        content: [p('Checked task'), bullet('Task child')]
      }, {
        type: 'taskItem',
        attrs: {
          checked: false
        },
        content: [p('Unchecked task')]
      }]
    }]
  }]
}, {
  type: 'nestedBlock',
  content: [p('Parent'), {
    type: 'heading',
    attrs: {
      level: 4,
      blockColor: 'purple'
    },
    content: [{
      type: 'text',
      text: 'Nested heading'
    }]
  }, {
    type: 'blockquote',
    content: [p('Quoted link', [{
      type: 'link',
      attrs: {
        href: 'https://example.com/path?x=1&y=2'
      }
    }])]
  }, {
    type: 'codeBlock',
    attrs: {
      language: 'js'
    },
    content: [{
      type: 'text',
      text: " \tconst thing = '**literal**';\n\n  end();\n"
    }]
  }]
}, p('Tail second')];
const serialize = content => manager.serialize({
  type: 'doc',
  content
});
const original = {
  questions: IDENTITY_QUESTION_TITLES.map((title, index) => ({
    title,
    paragraphs: [index === 0 ? serialize(first) : index === 1 ? serialize(second) : `Untouched ${index + 1}`]
  }))
};
const viewports = [[320, 844], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 844], [1440, 844], [1920, 844]];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function select(editor, reverse) {
  await editor.evaluate((el, reverse) => {
    el.focus();
    const first = el.querySelector('[data-question-body="0"] > p'),
      last = el.querySelector('[data-question-body="1"] > p:last-child');
    const a = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode(),
      walk = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let b, node;
    while (node = walk.nextNode()) b = node;
    if (!a || !b) throw Error('Missing visible range endpoints');
    getSelection().setBaseAndExtent(reverse ? b : a, reverse ? b.length : 0, reverse ? a : b, reverse ? 0 : b.length);
  }, reverse);
  await editor.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const range = await editor.evaluate(el => {
    const s = getSelection(),
      view = el.editor.view;
    return {
      model: el.editor.state.selection.toJSON(),
      anchor: view.posAtDOM(s.anchorNode, s.anchorOffset),
      head: view.posAtDOM(s.focusNode, s.focusOffset),
      text: s.toString()
    };
  });
  assert.equal(range.model.anchor, range.anchor);
  assert.equal(range.model.head, range.head);
  assert(range.text.includes('Lead first') && range.text.includes('Tail second'));
  assert.equal(range.anchor > range.head, reverse);
}
async function selectByText(editor, start, end, reverse) {
  await editor.evaluate((el, {
    start,
    end,
    reverse
  }) => {
    const find = endpoint => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walk.nextNode()) if (endpoint.contains ? node.textContent.includes(endpoint.contains) : node.textContent === endpoint.text) return node;
      throw Error('Missing endpoint ' + JSON.stringify(endpoint));
    };
    const a = find(start),
      b = find(end),
      aOffset = start.offset ?? 0,
      bOffset = end.offset ?? b.length;
    el.focus();
    getSelection().setBaseAndExtent(reverse ? b : a, reverse ? bOffset : aOffset, reverse ? a : b, reverse ? aOffset : bOffset);
  }, {
    start,
    end,
    reverse
  });
  await editor.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const actual = await editor.evaluate(el => {
    const s = getSelection(),
      v = el.editor.view;
    return {
      model: el.editor.state.selection.toJSON(),
      anchor: v.posAtDOM(s.anchorNode, s.anchorOffset),
      head: v.posAtDOM(s.focusNode, s.focusOffset)
    };
  });
  assert.equal(actual.model.anchor, actual.anchor);
  assert.equal(actual.model.head, actual.head);
}
export async function checkPartialCrossClipboard(browser, origin) {
  const cases = [['table-edge', {
    text: 'Merged header'
  }, {
    text: 'Tail second'
  }], ['list-task', {
    text: 'List two',
    offset: 2
  }, {
    text: 'Task child',
    offset: 4
  }], ['nested-code', {
    text: 'Ordered child',
    offset: 3
  }, {
    contains: 'const thing',
    offset: 25
  }]];
  const title = index => JSON.parse(JSON.stringify(schema.nodes.heading.create({
    level: 3
  }, schema.text(IDENTITY_QUESTION_TITLES[index])).toJSON()));
  for (const [width, height] of viewports) {
    for (const [name, start, end] of cases) for (const reverse of [false, true]) {
      const page = await browser.newPage({
          viewport: {
            width,
            height
          },
          permissions: ['clipboard-read', 'clipboard-write']
        }),
        errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', r => {
        errors.push('Unexpected API request');
        return r.abort();
      });
      await page.addInitScript(() => {
        sessionStorage.removeItem('rollapp:text:inline-fixture:fixture');
        sessionStorage.removeItem('rollapp:text:inline-fixture:identity:four-questions');
      });
      const four = `${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(original))}`,
        plain = value => `${origin}/__text-edit?source=${encodeURIComponent(value)}`;
      await page.goto(four);
      const protectedEditor = page.getByRole('textbox', {
        name: 'Ответы на четыре вопроса',
        exact: true
      });
      await protectedEditor.locator('[data-question-body="3"]').waitFor();
      const before = await protectedEditor.evaluate(el => el.editor.getJSON());
      const flat = before.content.flatMap((section, index) => [...(index ? [title(index)] : []), ...section.content]),
        reference = serialize(flat),
        editor = page.getByRole('textbox', {
          name: 'О себе',
          exact: true
        });
      await page.goto(plain(reference));
      await editor.waitFor();
      await selectByText(editor, start, end, reverse);
      await page.keyboard.press('ControlOrMeta+c');
      const referenceClipboard = await clipboard(page);
      await page.goto(plain(''));
      await editor.waitFor();
      await editor.click();
      await page.keyboard.press('ControlOrMeta+v');
      await frames(page);
      const expected = await editor.evaluate(el => el.editor.getJSON());
      await page.goto(four);
      await protectedEditor.locator('[data-question-body="3"]').waitFor();
      await selectByText(protectedEditor, start, end, reverse);
      await page.keyboard.press('ControlOrMeta+c');
      const actualClipboard = await clipboard(page);
      assert.equal(actualClipboard.text, referenceClipboard.text, `${name}: protected wrappers retain plain-editor clipboard text`);
      assert.deepEqual(await protectedEditor.evaluate(el => el.editor.getJSON()), before);
      await page.goto(plain(''));
      await editor.waitFor();
      await editor.click();
      await page.keyboard.press('ControlOrMeta+v');
      await frames(page);
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), expected, `partial-${name}`, width, reverse);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PARTIAL ${width} ${name} ${reverse ? 'reverse' : 'forward'} native plain-reference parity PASS`);
    }
    console.log(`PASS partial cross-answer clipboard ${width}x${height}: table/list/task/code endpoints in both directions retain native plain-editor semantics, exact rich clipboard and no API`);
  }
}
export async function checkCellClipboard(browser, origin) {
  const title = JSON.parse(JSON.stringify(schema.nodes.heading.create({
    level: 3
  }, schema.text(IDENTITY_QUESTION_TITLES[1])).toJSON()));
  for (const [width, height] of viewports) {
    const page = await browser.newPage({
        viewport: {
          width,
          height
        },
        permissions: ['clipboard-read', 'clipboard-write']
      }),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => {
      errors.push('Unexpected API request');
      return r.abort();
    });
    await page.addInitScript(() => {
      sessionStorage.removeItem('rollapp:text:inline-fixture:fixture');
      sessionStorage.removeItem('rollapp:text:inline-fixture:identity:four-questions');
    });
    const four = `${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(original))}`,
      plain = value => `${origin}/__text-edit?source=${encodeURIComponent(value)}`;
    const selectCells = async editor => {
      const table = editor.locator('table').first();
      await table.locator('td p').first().click();
      await editor.press('ControlOrMeta+/');
      const menu = page.getByRole('dialog', {
        name: 'Действия текстового блока',
        exact: true
      });
      await menu.getByRole('button', {
        name: 'Выделить строку',
        exact: true
      }).click();
      await menu.waitFor({
        state: 'hidden'
      });
      await table.locator('th').first().click({
        modifiers: ['Shift']
      });
      await frames(page);
      assert.equal(await editor.evaluate(el => el.editor.state.selection.toJSON().type), 'cell');
      assert.equal(await table.locator('.selectedCell').count(), 3);
    };
    await page.goto(four);
    const protectedEditor = page.getByRole('textbox', {
      name: 'Ответы на четыре вопроса',
      exact: true
    });
    await protectedEditor.locator('[data-question-body="3"]').waitFor();
    const before = await protectedEditor.evaluate(el => el.editor.getJSON());
    const flat = [...before.content[0].content, title, ...before.content[1].content],
      reference = serialize(flat),
      editor = page.getByRole('textbox', {
        name: 'О себе',
        exact: true
      });
    await page.goto(plain(reference));
    await editor.locator('table').waitFor();
    await selectCells(editor);
    await page.keyboard.press('ControlOrMeta+c');
    const referenceClipboard = await clipboard(page);
    await page.keyboard.press('ControlOrMeta+x');
    await frames(page);
    const referenceCutDocument = await editor.evaluate(el => el.editor.getJSON()),
      referenceCut = referenceCutDocument.content.find(node => node.type === 'table');
    await page.keyboard.press('ControlOrMeta+v');
    await frames(page);
    const referencePasted = await editor.evaluate(el => el.editor.getJSON());
    await cellHistory(page, editor, referencePasted, referenceCutDocument, width, 'plain');
    await page.goto(plain(''));
    await editor.waitFor();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+v');
    await frames(page);
    const expected = await editor.evaluate(el => el.editor.getJSON());
    await page.goto(four);
    await protectedEditor.locator('[data-question-body="3"]').waitFor();
    await selectCells(protectedEditor);
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await clipboard(page);
    assert.equal(copied.text, referenceClipboard.text, 'cell clipboard text retains per-cell range semantics');
    await page.goto(plain(''));
    await editor.waitFor();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+v');
    await frames(page);
    await exact(page, await editor.evaluate(el => el.editor.getJSON()), expected, 'cell-external-paste', width, false);
    await page.goto(four);
    await protectedEditor.locator('[data-question-body="3"]').waitFor();
    await selectCells(protectedEditor);
    await page.keyboard.press('ControlOrMeta+x');
    await frames(page);
    const cut = await protectedEditor.evaluate(el => el.editor.getJSON()),
      expectedCut = {
        ...before,
        content: before.content.map((section, index) => index ? section : {
          ...section,
          content: section.content.map(node => node.type === 'table' ? referenceCut : node)
        })
      };
    await exact(page, cut, expectedCut, 'cell-cut', width, false);
    await page.keyboard.press('ControlOrMeta+v');
    await frames(page);
    await exact(page, await protectedEditor.evaluate(el => el.editor.getJSON()), before, 'cell-paste', width, false);
    const typed = await cellHistory(page, protectedEditor, before, cut, width, 'protected');
    await protectedEditor.press('ControlOrMeta+s');
    await page.locator('[data-save-status="saved"]').waitFor();
    const saved = await page.evaluate(() => window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(saved))}`);
    await protectedEditor.locator('[data-question-body="3"]').waitFor();
    await exact(page, await protectedEditor.evaluate(el => el.editor.getJSON()), typed, 'cell-saved-reload', width, false);
    assert.deepEqual(await protectedEditor.locator('h3[contenteditable="false"]').allTextContents(), IDENTITY_QUESTION_TITLES);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS cell clipboard ${width}x${height}: merged rectangle, native plain-editor text/HTML parity, exact nested marks/widths, protected neighbours and independent cut/paste/typing Undo, no API`);
  }
}
async function cellHistory(page, editor, pasted, cut, width, label) {
  await page.keyboard.type('!');
  await frames(page);
  assert((await editor.textContent()).includes('!'));
  const typed = await editor.evaluate(el => el.editor.getJSON());
  for (const [name, expected] of [['typing-undo', pasted], ['paste-undo', cut], ['cut-undo', pasted]]) {
    await page.keyboard.press('ControlOrMeta+z');
    await exact(page, await editor.evaluate(el => el.editor.getJSON()), expected, `${label}-cell-${name}`, width, false);
  }
  for (const [name, expected] of [['cut-redo', cut], ['paste-redo', pasted], ['typing-redo', typed]]) {
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await exact(page, await editor.evaluate(el => el.editor.getJSON()), expected, `${label}-cell-${name}`, width, false);
  }
  await page.keyboard.press('ControlOrMeta+z');
  await exact(page, await editor.evaluate(el => el.editor.getJSON()), pasted, `${label}-cell-final`, width, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await exact(page, await editor.evaluate(el => el.editor.getJSON()), typed, `${label}-cell-final-redo`, width, false);
  return typed;
}
async function clipboard(page) {
  return page.evaluate(async () => {
    let html = '',
      text = '';
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html += await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
    }
    return {
      html,
      text
    };
  });
}
async function exact(page, actual, expected, label, width, reverse) {
  try {
    assert.deepEqual(actual, expected, label);
  } catch (error) {
    const stem = `/tmp/rollapp-cross-clipboard-${label}-${width}-${reverse ? 'reverse' : 'forward'}`;
    await writeFile(stem + '.json', JSON.stringify({
      actual,
      expected
    }, null, 2));
    await page.screenshot({
      path: stem + '.png'
    });
    throw error;
  }
}
export async function checkCrossClipboard(browser, origin) {
  for (const [width, height] of viewports) {
    for (const reverse of [false, true]) {
      const page = await browser.newPage({
          viewport: {
            width,
            height
          },
          permissions: ['clipboard-read', 'clipboard-write']
        }),
        errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', r => {
        errors.push('Unexpected API request');
        return r.abort();
      });
      await page.addInitScript(() => {
        sessionStorage.removeItem('rollapp:text:inline-fixture:fixture');
        sessionStorage.removeItem('rollapp:text:inline-fixture:identity:four-questions');
      });
      const four = value => `${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&four=1&questions=${encodeURIComponent(JSON.stringify(value))}`;
      await page.goto(four(original));
      const editor = page.getByRole('textbox', {
        name: 'Ответы на четыре вопроса',
        exact: true
      });
      await editor.locator('[data-question-body="3"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const before = await editor.evaluate(el => el.editor.getJSON()),
        expectedContent = [...before.content[0].content, JSON.parse(JSON.stringify(schema.nodes.heading.create({
          level: 3
        }, schema.text(IDENTITY_QUESTION_TITLES[1])).toJSON())), ...before.content[1].content];
      await select(editor, reverse);
      await page.keyboard.press('ControlOrMeta+c');
      const copied = await clipboard(page);
      assert(copied.html.includes('data-type="columns"'));
      assert(copied.html.includes('data-checked="true"'));
      assert(copied.text.includes(IDENTITY_QUESTION_TITLES[1]));
      assert(!copied.text.includes(IDENTITY_QUESTION_TITLES[0]));
      assert(!copied.text.includes(IDENTITY_QUESTION_TITLES[2]));
      assert.deepEqual(await editor.evaluate(el => el.editor.getJSON()), before);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
      await page.goto(`${origin}/__text-edit?source=`);
      const plain = page.getByRole('textbox', {
        name: 'О себе',
        exact: true
      });
      await plain.waitFor();
      await plain.click();
      const empty = await plain.evaluate(el => el.editor.getJSON());
      await page.keyboard.press('ControlOrMeta+v');
      await frames(page);
      const pasted = await plain.evaluate(el => el.editor.getJSON());
      await exact(page, pasted, {
        type: 'doc',
        content: expectedContent
      }, 'external-paste', width, reverse);
      await page.keyboard.type('!');
      await page.keyboard.press('ControlOrMeta+z');
      await exact(page, await plain.evaluate(el => el.editor.getJSON()), pasted, 'external-typing-undo', width, reverse);
      await page.keyboard.press('ControlOrMeta+z');
      assert.deepEqual(await plain.evaluate(el => el.editor.getJSON()), empty);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await plain.press('ControlOrMeta+s');
      await page.locator('[data-save-status="saved"]').waitFor();
      const savedPlain = await page.evaluate(() => window.inlineTest.saved);
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(savedPlain)}`);
      await plain.waitFor();
      await exact(page, await plain.evaluate(el => el.editor.getJSON()), pasted, 'external-reload', width, reverse);
      await page.goto(four(original));
      await editor.locator('[data-question-body="3"]').waitFor();
      await select(editor, reverse);
      await page.keyboard.press('ControlOrMeta+x');
      await frames(page);
      const emptyParagraph = JSON.parse(JSON.stringify(schema.nodes.paragraph.create().toJSON())),
        cut = {
          ...before,
          content: before.content.map((section, index) => index < 2 ? {
            ...section,
            content: [emptyParagraph]
          } : section)
        };
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), cut, 'cross-cut', width, reverse);
      await page.keyboard.press('ControlOrMeta+z');
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), before, 'cut-undo', width, reverse);
      await select(editor, reverse);
      await page.keyboard.press('ControlOrMeta+v');
      await frames(page);
      const replaced = {
        ...before,
        content: before.content.map((section, index) => index === 0 ? {
          ...section,
          content: expectedContent
        } : index === 1 ? {
          ...section,
          content: [emptyParagraph]
        } : section)
      };
      const after = await editor.evaluate(el => el.editor.getJSON());
      await exact(page, after, replaced, 'cross-paste', width, reverse);
      assert.deepEqual(await editor.locator('h3[contenteditable="false"]').allTextContents(), IDENTITY_QUESTION_TITLES);
      await page.keyboard.type('!');
      await page.keyboard.press('ControlOrMeta+z');
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), after, 'cross-typing-undo', width, reverse);
      await page.keyboard.press('ControlOrMeta+z');
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), before, 'cross-paste-undo', width, reverse);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await editor.press('ControlOrMeta+s');
      await page.locator('[data-save-status="saved"]').waitFor();
      const saved = await page.evaluate(() => window.inlineTest.saved);
      await page.goto(four(saved));
      await editor.locator('[data-question-body="3"]').waitFor();
      await exact(page, await editor.evaluate(el => el.editor.getJSON()), after, 'cross-reload', width, reverse);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS mixed cross-answer clipboard ${width}x${height}: native forward/reverse copy/cut/paste, merged tables/lists/closed toggles/columns/nested tasks/code/marks, fixed prompts, exact Undo and saved reload, no API/overflow`);
  }
}
