<script lang="ts">
	import scheduleData from '$lib/schedule-data.json';
	import { getStationList, queryTrips, type StaticSchedule } from '$lib/schedule.ts';
	import type { TripResult } from '$lib/schedule.ts';

	const schedule = scheduleData as unknown as StaticSchedule;
	const stations = getStationList(schedule);

	let origin = $state('');
	let destination = $state('');
	let dateStr = $state(new Date().toISOString().slice(0, 10));
	let results: TripResult[] = $state([]);
	let searched = $state(false);

	function search() {
		if (!origin || !destination || origin === destination) {
			results = [];
			searched = false;
			return;
		}
		const date = new Date(dateStr + 'T12:00:00');
		results = queryTrips(schedule, origin, destination, date);
		searched = true;
	}

	function swap() {
		const tmp = origin;
		origin = destination;
		destination = tmp;
		if (searched) search();
	}

	function routeTypeClass(rt: string): string {
		const lower = rt.toLowerCase();
		if (lower.includes('limited')) return 'badge limited';
		if (lower.includes('express')) return 'badge express';
		if (lower.includes('bullet')) return 'badge bullet';
		return 'badge local';
	}

	// Auto-search when inputs change
	$effect(() => {
		origin;
		destination;
		dateStr;
		search();
	});
</script>

<svelte:head>
	<title>Caltrain Schedule</title>
	<meta name="description" content="Browse Caltrain schedules between any two stations" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<main>
	<div class="container">
		<header>
			<h1>🚂 Caltrain</h1>
			<p class="subtitle">Schedule Browser</p>
		</header>

		<section class="controls">
			<div class="station-row">
				<div class="field">
					<label for="origin">From</label>
					<select id="origin" bind:value={origin}>
						<option value="">Select station...</option>
						{#each stations as s}
							<option value={s.id} disabled={s.id === destination}>{s.name}</option>
						{/each}
					</select>
				</div>

				<button class="swap-btn" onclick={swap} aria-label="Swap stations" disabled={!origin && !destination}>
					⇆
				</button>

				<div class="field">
					<label for="destination">To</label>
					<select id="destination" bind:value={destination}>
						<option value="">Select station...</option>
						{#each stations as s}
							<option value={s.id} disabled={s.id === origin}>{s.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="field date-field">
				<label for="date">Date</label>
				<input id="date" type="date" bind:value={dateStr} />
			</div>
		</section>

		{#if searched}
			<section class="results">
				{#if results.length > 0}
					<p class="result-count">{results.length} trip{results.length !== 1 ? 's' : ''} found</p>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Depart</th>
									<th>Arrive</th>
									<th>Duration</th>
									<th>Train</th>
									<th>Service</th>
								</tr>
							</thead>
							<tbody>
								{#each results as trip}
									<tr>
										<td class="time">{trip.departure}</td>
										<td class="time">{trip.arrival}</td>
										<td class="duration">{trip.duration}</td>
										<td class="train">#{trip.trainNumber}</td>
										<td><span class={routeTypeClass(trip.routeType)}>{trip.routeType}</span></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="no-results">
						<p>No trips found for this route on {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
						<p class="hint">Try a different date or direction</p>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(html) {
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		background: #0f0f13;
		color: #e8e8ed;
		-webkit-font-smoothing: antialiased;
	}

	main {
		min-height: 100vh;
		display: flex;
		justify-content: center;
		padding: 1.5rem 1rem;
	}

	.container {
		width: 100%;
		max-width: 540px;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #fff;
	}

	.subtitle {
		font-size: 0.875rem;
		color: #888;
		margin-top: 0.25rem;
	}

	.controls {
		background: #1a1a22;
		border: 1px solid #2a2a35;
		border-radius: 16px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.station-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.field {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.date-field {
		margin-top: 1rem;
	}

	label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	select, input[type="date"] {
		appearance: none;
		-webkit-appearance: none;
		background: #12121a;
		border: 1px solid #2a2a35;
		border-radius: 10px;
		color: #e8e8ed;
		font-family: inherit;
		font-size: 0.9375rem;
		padding: 0.625rem 0.875rem;
		width: 100%;
		transition: border-color 0.15s ease;
	}

	select:focus, input[type="date"]:focus {
		outline: none;
		border-color: #4e9bff;
	}

	select {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' fill='none' stroke-width='1.5'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		padding-right: 2.25rem;
	}

	.swap-btn {
		flex: 0 0 auto;
		width: 40px;
		height: 40px;
		background: #22222e;
		border: 1px solid #2a2a35;
		border-radius: 10px;
		color: #4e9bff;
		font-size: 1.125rem;
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.swap-btn:hover:not(:disabled) {
		background: #2a2a3a;
		border-color: #4e9bff;
	}

	.swap-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.results {
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.result-count {
		font-size: 0.8125rem;
		color: #888;
		margin-bottom: 0.75rem;
	}

	.table-wrap {
		background: #1a1a22;
		border: 1px solid #2a2a35;
		border-radius: 16px;
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead {
		background: #15151d;
	}

	th {
		font-size: 0.6875rem;
		font-weight: 600;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.75rem 0.875rem;
		text-align: left;
	}

	td {
		padding: 0.75rem 0.875rem;
		font-size: 0.9375rem;
		border-top: 1px solid #1f1f2a;
	}

	tr:hover td {
		background: #1e1e28;
	}

	.time {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: #fff;
	}

	.duration {
		color: #888;
		font-size: 0.8125rem;
	}

	.train {
		font-variant-numeric: tabular-nums;
		color: #aaa;
	}

	.badge {
		display: inline-block;
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		letter-spacing: 0.02em;
	}

	.badge.local {
		background: rgba(220, 221, 222, 0.15);
		color: #bbb;
	}

	.badge.limited {
		background: rgba(153, 215, 220, 0.15);
		color: #99d7dc;
	}

	.badge.express {
		background: rgba(206, 32, 47, 0.2);
		color: #ff6b6b;
	}

	.badge.bullet {
		background: rgba(206, 32, 47, 0.2);
		color: #ff6b6b;
	}

	.no-results {
		text-align: center;
		padding: 2.5rem 1rem;
		background: #1a1a22;
		border: 1px solid #2a2a35;
		border-radius: 16px;
	}

	.no-results p {
		color: #888;
	}

	.hint {
		font-size: 0.8125rem;
		margin-top: 0.5rem;
		color: #555 !important;
	}

	@media (max-width: 480px) {
		.station-row {
			flex-direction: column;
			align-items: stretch;
		}

		.swap-btn {
			align-self: center;
			transform: rotate(90deg);
		}

		th, td {
			padding: 0.625rem 0.5rem;
			font-size: 0.8125rem;
		}
	}
</style>
