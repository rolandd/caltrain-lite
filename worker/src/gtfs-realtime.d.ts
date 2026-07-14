// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { PbfReader, PbfWriter } from 'pbf';

export function readFeedMessage(pbf: PbfReader, end?: number): unknown;
export function writeFeedMessage(obj: unknown, pbf: PbfWriter): void;
