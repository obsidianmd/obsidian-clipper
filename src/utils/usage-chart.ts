import dayjs from 'dayjs';
import { HistoryEntry } from '../types/types';

interface WeeklyUsage {
	period: string;
	count: number;
}

interface ChartOptions {
	timeRange: '7d' | '30d' | 'all';
	aggregation: 'day' | 'week' | 'month';
}

export function createUsageChart(container: HTMLElement, data: WeeklyUsage[]): void {
	// Clear any existing content
	container.innerHTML = '';
	container.classList.add('usage-chart');

	const maxCount = Math.max(...data.map(d => d.count));
	const chartHeight = 80;
	const barGap = 4;

	// Create chart container
	const chartContainer = document.createElement('div');
	chartContainer.className = 'chart-line';
	
	// Create SVG for line chart
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '100%');
	svg.setAttribute('viewBox', `0 0 100 ${chartHeight}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.style.marginLeft = `${barGap/2}px`;
	svg.style.marginRight = `${barGap/2}px`;
	
	// Create polyline for the chart line
	const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	const points = data.map((d, i) => {
		const x = (i / (data.length - 1)) * 100;
		const y = chartHeight - ((d.count / maxCount) * chartHeight || 0);
		return `${x},${y}`;
	}).join(' ');
	
	polyline.setAttribute('points', points);
	polyline.classList.add('chart-line-path');
	
	svg.appendChild(polyline);
	chartContainer.appendChild(svg);
	
	// Add containers for labels
	data.forEach((periodData, index) => {
		const labelContainer = document.createElement('div');
		labelContainer.className = 'chart-bar-container';
		
		const label = document.createElement('div');
		label.className = 'chart-label';
		label.textContent = periodData.period;
		
		const count = document.createElement('div');
		count.className = 'chart-count';
		count.textContent = periodData.count.toString();
		
		labelContainer.appendChild(label);
		labelContainer.appendChild(count);
		chartContainer.appendChild(labelContainer);
	});

	container.appendChild(chartContainer);
}

export function aggregateUsageData(history: HistoryEntry[], options: ChartOptions): WeeklyUsage[] {
	const periodsData = new Map<string, number>();
	const today = dayjs();
	
	// Sort history by datetime in ascending order
	const sortedHistory = [...history].sort((a, b) => 
		dayjs(a.datetime).valueOf() - dayjs(b.datetime).valueOf()
	);
	
	// Filter history based on time range
	let filteredHistory = sortedHistory;
	if (options.timeRange !== 'all') {
		const days = options.timeRange === '7d' ? 7 : 30;
		const cutoff = today.subtract(days, 'day').startOf('day');
		filteredHistory = sortedHistory.filter(entry => 
			dayjs(entry.datetime).isAfter(cutoff)
		);
	}

	// Determine number of periods to show
	let periods: number;
	let startDate: dayjs.Dayjs;
	
	switch (options.timeRange) {
		case '7d':
			periods = options.aggregation === 'day' ? 7 : 2;
			startDate = today.subtract(6, 'day');
			break;
		case '30d':
			periods = options.aggregation === 'day' ? 30 : 
				options.aggregation === 'week' ? 5 : 2;
			startDate = today.subtract(29, 'day');
			break;
		case 'all':
			if (filteredHistory.length === 0) {
				periods = 1;
				startDate = today;
			} else {
				const earliest = dayjs(filteredHistory[0].datetime);
				
				// Calculate duration based on aggregation type
				let duration: number;
				switch (options.aggregation) {
					case 'day':
						duration = today.diff(earliest, 'day');
						periods = Math.min(Math.max(duration + 1, 1), 30);
						break;
					case 'week':
						duration = today.diff(earliest, 'week');
						periods = Math.min(Math.max(duration + 1, 1), 12);
						break;
					case 'month':
						duration = today.diff(earliest, 'month');
						periods = Math.min(Math.max(duration + 1, 1), 12);
						break;
				}
				startDate = today.subtract(periods - 1, options.aggregation);
			}
			break;
	}

	// Initialize periods with 0 counts
	for (let i = 0; i < periods; i++) {
		let periodStart: dayjs.Dayjs;
		let format: string;
		
		switch (options.aggregation) {
			case 'day':
				periodStart = startDate.add(i, 'day');
				format = periodStart.year() === today.year() ? 'MMM D' : 'MMM D YYYY';
				break;
			case 'week':
				periodStart = startDate.add(i, 'week').startOf('week');
				format = periodStart.year() === today.year() ? 'MMM D' : 'MMM D YYYY';
				break;
			case 'month':
				periodStart = startDate.add(i, 'month').startOf('month');
				format = 'MMM YYYY';
				break;
		}
		
		periodsData.set(periodStart.format(format), 0);
	}
	
	// Count entries per period
	filteredHistory.forEach(entry => {
		const entryDate = dayjs(entry.datetime);
		let periodStart: string;
		
		switch (options.aggregation) {
			case 'day':
				periodStart = entryDate.year() === today.year() ? 
					entryDate.format('MMM D') : 
					entryDate.format('MMM D YYYY');
				break;
			case 'week':
				const weekStart = entryDate.startOf('week');
				periodStart = weekStart.year() === today.year() ? 
					weekStart.format('MMM D') : 
					weekStart.format('MMM D YYYY');
				break;
			case 'month':
				periodStart = entryDate.startOf('month').format('MMM YYYY');
				break;
		}
		
		if (periodsData.has(periodStart)) {
			periodsData.set(periodStart, (periodsData.get(periodStart) || 0) + 1);
		}
	});
	
	return Array.from(periodsData.entries()).map(([period, count]) => ({
		period,
		count
	}));
} 