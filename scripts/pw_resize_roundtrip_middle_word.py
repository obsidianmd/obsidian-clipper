#!/usr/bin/env python3
"""
Regression: resizing a selected inner text highlight should work in both directions
even when another larger highlight overlaps it.

What this script does:
1. Creates a small middle-word highlight ("Clerk").
2. Creates a larger overlapping highlight ("James Clerk Maxwell").
3. Selects the small highlight and resizes it to the larger range.
4. Resizes the same highlight back to the small range.

Why this exists:
- The offset-handle resize path previously regressed in overlap scenarios.
- We need a repeatable browser-level check that catches future regressions.
"""

import json
import sys
import time
from dataclasses import dataclass
from typing import Any

from playwright.sync_api import sync_playwright

TARGET_URL = "https://en.wikipedia.org/wiki/James_Clerk_Maxwell"
TARGET_URL_PATTERN = "wikipedia.org/wiki/James_Clerk_Maxwell"
EXT_PATH = "/Users/clehene/rosetta/obsidian/obsidian-clipper/dist"


@dataclass
class DragPoint:
	x: float
	y: float


def normalize_text(value: str) -> str:
	return " ".join((value or "").replace("\n", " ").split())


def read_storage(service_worker: Any) -> dict[str, Any]:
	# Returns persisted highlights for the current page so assertions can target ids/content.
	return service_worker.evaluate(
		"""
		async ({ pageUrl }) => {
		  const all = await chrome.storage.local.get('highlights');
		  const entry = (all.highlights && all.highlights[pageUrl]) || null;
		  if (!entry || !Array.isArray(entry.highlights)) {
		    return { count: 0, items: [] };
		  }
		  return {
		    count: entry.highlights.length,
		    items: entry.highlights.map((h) => ({
		      id: h.id,
		      type: h.type,
		      xpath: h.xpath,
		      startOffset: h.startOffset,
		      endOffset: h.endOffset,
		      content: String(h.content || '')
		    }))
		  };
		}
		""",
		{"pageUrl": TARGET_URL},
	)


def drag(page: Any, start: DragPoint, end: DragPoint, steps: int = 20) -> dict[str, Any]:
	# Uses real pointer drag so handle-resize behavior matches user interaction.
	page.mouse.move(start.x, start.y)
	page.mouse.down()
	down_state = page.evaluate(
		"""
		() => {
		  const startHandle = document.querySelector('.obsidian-highlight-offset-handle-start');
		  const endHandle = document.querySelector('.obsidian-highlight-offset-handle-end');
		  const selection = window.getSelection();
		  return {
		    startDragging: !!(startHandle && startHandle.classList.contains('is-dragging')),
		    endDragging: !!(endHandle && endHandle.classList.contains('is-dragging')),
		    selectionLength: selection ? selection.toString().length : 0
		  };
		}
		"""
	)
	page.mouse.move(end.x, end.y, steps=steps)
	page.mouse.up()
	return down_state


def drag_with_character_samples(page: Any, start: DragPoint, points: list[dict[str, Any]]) -> dict[str, Any]:
	# Samples selection growth at per-character points to catch non-fluent resize behavior.
	page.mouse.move(start.x, start.y)
	page.mouse.down()
	down_state = page.evaluate(
		"""
		() => {
		  const endHandle = document.querySelector('.obsidian-highlight-offset-handle-end');
		  const selection = window.getSelection();
		  return {
		    endDragging: !!(endHandle && endHandle.classList.contains('is-dragging')),
		    selectionLength: selection ? selection.toString().length : 0
		  };
		}
		"""
	)

	samples: list[dict[str, Any]] = []
	for point in points:
		page.mouse.move(point["x"], point["y"], steps=1)
		page.wait_for_timeout(12)
		sample = page.evaluate(
			"""
			() => {
			  const endHandle = document.querySelector('.obsidian-highlight-offset-handle-end');
			  const selection = window.getSelection();
			  return {
			    endDragging: !!(endHandle && endHandle.classList.contains('is-dragging')),
			    selectionLength: selection ? selection.toString().length : 0
			  };
			}
			"""
		)
		sample["char"] = point.get("char")
		samples.append(sample)

	page.mouse.up()
	return {
		"down": down_state,
		"samples": samples,
	}


def summarize_items(raw: dict[str, Any]) -> list[dict[str, Any]]:
	return [
		{
			"id": item.get("id"),
			"startOffset": item.get("startOffset"),
			"endOffset": item.get("endOffset"),
			"content": normalize_text(item.get("content", "")),
		}
		for item in raw.get("items", [])
	]


def main() -> int:
	profile_dir = f"/tmp/pw-resize-roundtrip-middle-{int(time.time() * 1000)}"
	result: dict[str, Any] = {"profile_dir": profile_dir}

	with sync_playwright() as p:
		context = p.chromium.launch_persistent_context(
			profile_dir,
			headless=False,
			ignore_default_args=["--disable-extensions"],
			args=[
				f"--disable-extensions-except={EXT_PATH}",
				f"--load-extension={EXT_PATH}",
			],
			viewport={"width": 1440, "height": 900},
		)

		page = context.pages[0] if context.pages else context.new_page()
		page.set_default_timeout(15000)
		page.goto(TARGET_URL, wait_until="domcontentloaded")

		deadline = time.time() + 20
		while time.time() < deadline and not context.service_workers:
			time.sleep(0.2)

		service_worker = context.service_workers[0] if context.service_workers else None
		if not service_worker:
			result["ok"] = False
			result["reason"] = "no_service_worker"
			print(json.dumps(result, indent=2))
			context.close()
			return 1

		setup = service_worker.evaluate(
			f"""
			async () => {{
			  const tabs = await chrome.tabs.query({{}});
			  const preferred = tabs.find((t) => typeof t.id === 'number' && t.url && (t.url || '').includes('{TARGET_URL_PATTERN}'))
			    || tabs.find((t) => typeof t.id === 'number' && t.active && /^https?:/i.test(t.url || ''));
			  if (!preferred) return {{ ok: false, reason: 'no_tab' }};

			  await chrome.scripting.executeScript({{ target: {{ tabId: preferred.id }}, files: ['content.js'] }});
			  await new Promise((resolve) => setTimeout(resolve, 120));

			  const all = await chrome.storage.local.get('highlights');
			  const map = all.highlights || {{}};
			  delete map['{TARGET_URL}'];
			  await chrome.storage.local.set({{ highlights: map }});
			  await chrome.tabs.sendMessage(preferred.id, {{ action: 'paintHighlights' }}).catch(() => ({{}}));
			  await chrome.tabs.sendMessage(preferred.id, {{ action: 'setHighlighterMode', isActive: true }}).catch(() => ({{}}));
			  return {{ ok: true, tabId: preferred.id }};
			}}
			"""
		)
		result["setup"] = setup

		geometry = page.evaluate(
			"""
			() => {
			  const root = document.body || document.documentElement;
			  if (!root) return { ok: false, reason: 'no_root' };

			  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			  let node = walker.nextNode();
			  let target = null;
			  let base = -1;
			  while (node) {
			    const text = node.textContent || '';
			    const index = text.indexOf('James Clerk Maxwell');
			    if (index >= 0) {
			      target = node;
			      base = index;
			      break;
			    }
			    node = walker.nextNode();
			  }
			  if (!target || base < 0) return { ok: false, reason: 'name_not_found' };

			  const jamesStart = base;
			  const clerkStart = base + 6;
			  const clerkEnd = base + 11;
			  const fullEnd = base + 19;
			  const expansionPoints = [];

			  function pointAt(start, end, side) {
			    const range = document.createRange();
			    range.setStart(target, start);
			    range.setEnd(target, end);
			    const rect = range.getBoundingClientRect();
			    if (side === 'left') return { x: rect.left + 1, y: rect.top + rect.height / 2 };
			    return { x: rect.right - 1, y: rect.top + rect.height / 2 };
			  }

			  for (let i = clerkEnd + 1; i <= fullEnd; i += 1) {
			    const range = document.createRange();
			    range.setStart(target, i - 1);
			    range.setEnd(target, i);
			    const rect = range.getBoundingClientRect();
			    expansionPoints.push({
			      x: rect.left + rect.width / 2,
			      y: rect.top + rect.height / 2,
			      char: (target.textContent || '').slice(i - 1, i)
			    });
			  }

			  return {
			    ok: true,
			    clerkLeft: pointAt(clerkStart, clerkStart + 1, 'left'),
			    clerkRight: pointAt(clerkEnd - 1, clerkEnd, 'right'),
			    fullLeft: pointAt(jamesStart, jamesStart + 1, 'left'),
			    fullRight: pointAt(fullEnd - 1, fullEnd, 'right'),
			    expansionPoints
			  };
			}
			"""
		)
		result["geometry"] = geometry
		if not geometry.get("ok"):
			result["ok"] = False
			result["reason"] = "geometry_lookup_failed"
			print(json.dumps(result, indent=2))
			context.close()
			return 1

		def create_text_highlight_via_range(text: str) -> dict[str, Any]:
			# Creates an exact text highlight from a DOM range to avoid drag-selection flakiness.
			return page.evaluate(
				"""
				({ targetText }) => {
				  const root = document.body || document.documentElement;
				  if (!root) return { ok: false, reason: 'no_root' };

				  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
				  let node = walker.nextNode();
				  let targetNode = null;
				  let start = -1;
				  while (node) {
				    const text = node.textContent || '';
				    const idx = text.indexOf(targetText);
				    if (idx >= 0) {
				      targetNode = node;
				      start = idx;
				      break;
				    }
				    node = walker.nextNode();
				  }
				  if (!targetNode || start < 0) {
				    return { ok: false, reason: 'text_not_found', targetText };
				  }

				  const end = start + targetText.length;
				  const range = document.createRange();
				  range.setStart(targetNode, start);
				  range.setEnd(targetNode, end);
				  const selection = window.getSelection();
				  if (!selection) return { ok: false, reason: 'no_selection' };
				  selection.removeAllRanges();
				  selection.addRange(range);

				  const rect = range.getBoundingClientRect();
				  document.dispatchEvent(new MouseEvent('mouseup', {
				    bubbles: true,
				    cancelable: true,
				    view: window,
				    clientX: rect.right - 1,
				    clientY: rect.top + rect.height / 2,
				  }));

				  return { ok: true, text: range.toString() };
				}
				""",
				{"targetText": text},
			)

		def click_overlay_by_text(text: str) -> dict[str, Any]:
			# Selects a specific highlight deterministically, even with overlapping overlays.
			return page.evaluate(
				"""
				({ targetText }) => {
				  const normalize = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
				  const overlays = Array.from(document.querySelectorAll('.obsidian-highlight-overlay'));
				  const target = overlays.find((o) => normalize(o.getAttribute('data-content') || '') === targetText);
				  if (!target) {
				    return {
				      ok: false,
				      reason: 'overlay_not_found',
				      targetText,
				      available: overlays.map((o) => normalize(o.getAttribute('data-content') || ''))
				    };
				  }
				  const rect = target.getBoundingClientRect();
				  target.dispatchEvent(new MouseEvent('click', {
				    bubbles: true,
				    cancelable: true,
				    view: window,
				    clientX: rect.left + Math.min(4, Math.max(1, rect.width / 2)),
				    clientY: rect.top + Math.min(4, Math.max(1, rect.height / 2)),
				  }));
				  return {
				    ok: true,
				    id: target.getAttribute('data-highlight-id') || null,
				    text: normalize(target.getAttribute('data-content') || '')
				  };
				}
				""",
				{"targetText": text},
			)

		def click_overlay_by_id(highlight_id: str) -> dict[str, Any]:
			# Re-selects the same logical highlight across resize steps by persistent id.
			return page.evaluate(
				"""
				({ id }) => {
				  if (!id) return { ok: false, reason: 'no_id' };
				  const overlay = document.querySelector(`.obsidian-highlight-overlay[data-highlight-id="${id}"]`);
				  if (!overlay) {
				    return {
				      ok: false,
				      reason: 'overlay_id_not_found',
				      visibleIds: Array.from(document.querySelectorAll('.obsidian-highlight-overlay')).map((o) => o.getAttribute('data-highlight-id'))
				    };
				  }
				  const rect = overlay.getBoundingClientRect();
				  overlay.dispatchEvent(new MouseEvent('click', {
				    bubbles: true,
				    cancelable: true,
				    view: window,
				    clientX: rect.left + Math.min(4, Math.max(1, rect.width / 2)),
				    clientY: rect.top + Math.min(4, Math.max(1, rect.height / 2)),
				  }));
				  return { ok: true };
				}
				""",
				{"id": highlight_id},
			)

		def get_handle_center(edge: str) -> dict[str, Any]:
			# Returns a visible handle center used as drag source for precise resize tests.
			return page.evaluate(
				"""
				({ edge }) => {
				  const handle = document.querySelector(`.obsidian-highlight-offset-handle-${edge}`);
				  if (!handle) return { ok: false, reason: 'no_handle', edge };
				  const style = getComputedStyle(handle);
				  const rect = handle.getBoundingClientRect();
				  const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				  if (!visible) return { ok: false, reason: 'handle_not_visible', edge };
				  return { ok: true, edge, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
				}
				""",
				{"edge": edge},
			)

		# 1) Create inner and outer highlights.
		create_small = create_text_highlight_via_range("Clerk")
		page.wait_for_timeout(260)
		create_large = create_text_highlight_via_range("James Clerk Maxwell")
		page.wait_for_timeout(450)
		result["create_small"] = create_small
		result["create_large"] = create_large
		after_create = read_storage(service_worker)
		result["after_create"] = summarize_items(after_create)

		# 2) Select the inner ("Clerk") highlight and resize to full range.
		selected_small = click_overlay_by_text("Clerk")
		result["selected_small"] = selected_small
		selected_small_id = selected_small.get("id")
		page.wait_for_timeout(200)

		start_handle_1 = get_handle_center("start")
		result["start_handle_1"] = start_handle_1
		if start_handle_1.get("ok"):
			result["drag_start_to_full"] = drag(
				page,
				DragPoint(start_handle_1["x"], start_handle_1["y"]),
				DragPoint(**geometry["fullLeft"]),
			)
		page.wait_for_timeout(240)

		reselect_after_start = click_overlay_by_id(selected_small_id)
		result["reselect_after_start"] = reselect_after_start
		page.wait_for_timeout(160)

		end_handle_1 = get_handle_center("end")
		result["end_handle_1"] = end_handle_1
		if end_handle_1.get("ok"):
			expansion_points = geometry.get("expansionPoints") or []
			if expansion_points:
				final_point = {
					"x": float(geometry["fullRight"]["x"]),
					"y": float(geometry["fullRight"]["y"]),
					"char": "__end__",
				}
				result["drag_end_to_full"] = drag_with_character_samples(
					page,
					DragPoint(end_handle_1["x"], end_handle_1["y"]),
					expansion_points + [final_point],
				)
			else:
				result["drag_end_to_full"] = {
					"down": drag(
						page,
						DragPoint(end_handle_1["x"], end_handle_1["y"]),
						DragPoint(**geometry["fullRight"]),
					),
					"samples": [],
				}
		page.wait_for_timeout(450)
		after_grow = read_storage(service_worker)
		result["after_grow"] = summarize_items(after_grow)

		# 3) Re-select same id and resize back to inner range.
		reselect_before_shrink = click_overlay_by_id(selected_small_id)
		result["reselect_before_shrink"] = reselect_before_shrink
		page.wait_for_timeout(180)

		end_handle_2 = get_handle_center("end")
		result["end_handle_2"] = end_handle_2
		if end_handle_2.get("ok"):
			result["drag_end_to_small"] = drag(
				page,
				DragPoint(end_handle_2["x"], end_handle_2["y"]),
				DragPoint(**geometry["clerkRight"]),
			)
		page.wait_for_timeout(260)

		reselect_between_shrink = click_overlay_by_id(selected_small_id)
		result["reselect_between_shrink"] = reselect_between_shrink
		page.wait_for_timeout(160)

		start_handle_2 = get_handle_center("start")
		result["start_handle_2"] = start_handle_2
		if start_handle_2.get("ok"):
			result["drag_start_to_small"] = drag(
				page,
				DragPoint(start_handle_2["x"], start_handle_2["y"]),
				DragPoint(**geometry["clerkLeft"]),
			)
		page.wait_for_timeout(500)
		after_shrink = read_storage(service_worker)
		result["after_shrink"] = summarize_items(after_shrink)

		selected_after_grow = next((h for h in after_grow.get("items", []) if h.get("id") == selected_small_id), None)
		selected_after_shrink = next((h for h in after_shrink.get("items", []) if h.get("id") == selected_small_id), None)

		checks = {
			"created_two_highlights": after_create.get("count", 0) >= 2,
			"selected_small_is_clerk": selected_small.get("ok", False) and normalize_text(selected_small.get("text", "")) == "Clerk",
			"grow_reaches_full": bool(selected_after_grow and normalize_text(selected_after_grow.get("content", "")) == "James Clerk Maxwell"),
			"shrink_returns_to_clerk": bool(selected_after_shrink and normalize_text(selected_after_shrink.get("content", "")) == "Clerk"),
		}

		char_samples = (result.get("drag_end_to_full") or {}).get("samples", [])
		char_lengths = [int(sample.get("selectionLength", 0)) for sample in char_samples]
		unique_lengths = len(set(char_lengths))
		monotonic_growth = all(char_lengths[index] <= char_lengths[index + 1] for index in range(len(char_lengths) - 1))
		dragging_during_samples = all(bool(sample.get("endDragging")) for sample in char_samples)
		checks["char_step_growth_is_fluent"] = bool(char_samples) and dragging_during_samples and monotonic_growth and unique_lengths >= 3

		checks["passed"] = all(checks.values())
		result["checks"] = checks
		result["ok"] = checks["passed"]

		print(json.dumps(result, indent=2))
		context.close()
		return 0 if checks["passed"] else 1


if __name__ == "__main__":
	sys.exit(main())
