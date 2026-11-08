---
version: alpha
name: Inventopedia
description: A clear, considered workspace for inventory teams.
colors:
  ink: "#18253B"
  muted: "#64748B"
  primary: "#315DE8"
  canvas: "#F5F7FB"
  surface: "#FFFFFF"
  border: "#E3E9F1"
typography:
  sans:
    fontFamily: "Manrope, system-ui, sans-serif"
  mono:
    fontFamily: "IBM Plex Mono, monospace"
rounded:
  DEFAULT: "0.75rem"
spacing:
  page: "2rem"
components:
  button: {}
  card: {}
  dialog: {}
---

# Inventopedia design system

## Overview

Inventopedia is a product workspace for people responsible for physical stock.
Its reference is the ordered clarity of a warehouse location label: clear names,
legible quantities and a compact inventory-code motif. The product is English
first, with no market-specific locale assumed. Use practical, direct language.
Avoid decorative dashboards, fabricated activity and marketing-heavy interfaces.

## Colors

The runtime tokens in `packages/web/src/index.css` mirror the palette above.
White surfaces sit on a cool canvas; cobalt marks the active location and primary
action. Muted text is reserved for supporting information. Error and success
states also include text so meaning never depends on color alone.

## Typography

Manrope provides warm, readable interface text; IBM Plex Mono identifies compact
technical values. System fallbacks keep controls usable if fonts cannot load.

## Layout

Use a persistent navigation rail on wide screens and a compact horizontal
navigation on narrow screens. Data tables scroll horizontally without clipping
the page. Forms and actions retain their positions during asynchronous work.

## Elevation & Depth

Use borders and subtle surface contrast to separate regions; reserve shadows for
floating dialogs. Keep the operational content visually calm.

## Shapes

Rounded corners soften cards and controls without turning data into decoration.

## Components

Buttons, fields, tables, notifications and dialogs use shared styles and visible
focus states. Destructive actions require an app-owned confirmation. Native
selects are intentional: platform-owned menus and keyboard behavior are accepted.

## Do's and Don'ts

Do show actual API data, permissions and actionable errors. Do not invent stock,
subscription quotas, analytics or unfinished features.
