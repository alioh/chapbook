/*
This "renders" a template as parsed by the `parser` module. It actually does
more than render it to HTML, as templates have side effects (e.g. changing
variables).
*/

import marked from 'marked';
import logger from '../logger';
import markdownRenderer from './markdown-renderer';
import renderInserts from './render-inserts';
import renderLinks from './render-links';
import {set} from '../state';

const {log} = logger('render');

export const markedOptions = {
	renderer: markdownRenderer,
	smartypants: true
};

export default function render(parsed, inserts, modifiers, ignoreVars = false) {
	if (!parsed.vars) {
		throw new Error(
			'The renderer was given an object with no vars property.'
		);
	}

	if (!parsed.blocks) {
		throw new Error(
			'The renderer was given an object with no blocks property.'
		);
	}

	let markdown = '';

	/* Dispatch variable changes. */

	if (!ignoreVars) {
		log(`Setting vars (${parsed.vars.length})`);

		parsed.vars.forEach(v => {
			if (v.condition) {
				const condition = v.condition();

				if (condition) {
					log(`Setting var "${name}" (condition is currently true)`);
					set(v.name, v.value());
				} else {
					log(
						`Not setting var "${name}" (condition is currently false)`
					);
				}
			} else {
				log(`Setting var "${name}"`);
				set(v.name, v.value());
			}
		});
	}

	/* Parse the blocks in sequence. */

	let activeModifiers = [];
	const modifierState = {};

	parsed.blocks.forEach(block => {
		switch (block.type) {
			case 'text': {
				/*
				We allow modifiers to change the text, as well as add text
				before or after it. We allow this separation to keep the
				original text intact.
				*/

				let blockOutput = {
					text: renderInserts(renderLinks(block.content), inserts),
					beforeText: '\n\n',
					afterText: ''
				};

				/* Allow all active modifiers to alter the text. */

				log(
					`Running ${activeModifiers.length} modifiers on text block`
				);

				activeModifiers.forEach(m =>
					m.mod.process(blockOutput, {
						state: modifierState[m.mod],
						invocation: m.invocation
					})
				);

				markdown +=
					blockOutput.beforeText +
					blockOutput.text +
					blockOutput.afterText;

				log(`Output after modifiers: ${JSON.stringify(blockOutput)}`);

				/*
				Clear modifiers so that the next set will start with a clean
				slate.
				*/

				activeModifiers = [];
				break;
			}

			case 'modifier': {
				/* Find all modifiers whose regexp matches this one's. */

				const mods = modifiers.filter(m => m.match.test(block.content));

				if (mods.length === 1) {
					const mod = mods[0];

					log(
						`Activated "${mod.name}" modifier matching [${
							block.content
						}]`
					);

					modifierState[mod] = modifierState[mod] || {};
					activeModifiers.push({
						mod,
						invocation: block.content
					});
				} else if (mods.length === 0) {
					/*
					No modifier matched; output the source as-is, as it might be
					something the author intended to display.
					*/

					markdown += `\n\n[${block.content}]\n\n`;
				} else {
					console.warn(
						`More than one modifier matched "[${block.content}]".`
					);

					markdown += `\n\n[${block.content}]\n\n`;
				}
				break;
			}

			default:
				throw new Error(
					`Don't know how to render a block with type "${
						block.type
					}".`
				);
		}
	});

	/* Finally, render the Markdown to HTML. */

	marked.setOptions(markedOptions);
	log(`Final Markdown:\n${markdown}`);
	return marked(markdown);
}
