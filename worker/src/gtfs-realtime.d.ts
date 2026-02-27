// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type Pbf from 'pbf';

export function readFeedMessage(pbf: Pbf, end?: number): unknown;
export function writeFeedMessage(obj: unknown, pbf: Pbf): void;
