/**
 * Default templates for screen and figure blocks.
 *
 * Rendering rule: a screen or figure block that no take element covers renders
 * from its default template if one matches, otherwise exactly as the source drew
 * it. A take covers a block with a `render` element (body: template,
 * template_commit, state), which always wins over the default.
 *
 * A template is human-authored code in this repo. Its id is "setting/name"
 * (e.g. "veridia/vote"). In-world fonts are allowed inside a template only.
 * None are registered yet; register them here when they are built.
 */
import type { BlockLike } from '~/lib/reading';

export interface ScreenTemplate {
  id: string;
  /** True if this template is the default for the block. Reads block.data (setting, device, fields). */
  matches(block: BlockLike): boolean;
  /** HTML for the block. Must show the same content the source shows. */
  render(block: BlockLike): string;
}

export const DEFAULT_TEMPLATES: readonly ScreenTemplate[] = [];
