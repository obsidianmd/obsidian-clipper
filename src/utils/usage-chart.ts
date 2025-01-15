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

function formatPeriodDate(date: dayjs.Dayjs, today: dayjs.Dayjs, options: ChartOptions): string {
	switch (options.aggregation) {
		case 'day':
		case 'week':
			if (date.year() === today.year()) {
				return date.format('MMM D');
			}
			return date.format('MMM D YYYY');
		case 'month':
			return date.format('MMM YYYY');
	}
}

interface ChartPoint {
	x: number;
	y: number;
	date: string;
	count: number;
}

export async function createUsageChart(container: HTMLElement, data: WeeklyUsage[]): Promise<void> {
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
	svg.setAttribute('height', '100%');
	const viewBoxWidth = 1000;
	svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${chartHeight}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.style.marginLeft = `${barGap/2}px`;
	svg.style.marginRight = `${barGap/2}px`;
	
	// Create path for the chart line
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.classList.add('chart-line-path');
	
	// Generate smooth curve path
	const points: ChartPoint[] = data.map((d, i) => ({
		x: (i / (data.length - 1)) * viewBoxWidth,
		y: chartHeight - ((d.count / maxCount) * chartHeight || 0),
		date: d.period,
		count: d.count
	}));
	
	const pathData = points.reduce((acc, point, i, arr) => {
		if (i === 0) return `M ${point.x},${point.y}`;
		
		const prev = arr[i - 1];
		const tension = 0.2;
		const dx = point.x - prev.x;
		
		const cp1x = prev.x + dx * tension;
		const cp1y = prev.y;
		const cp2x = point.x - dx * tension;
		const cp2y = point.y;
		
		return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
	}, '');
	
	path.setAttribute('d', pathData);
	svg.appendChild(path);
	chartContainer.appendChild(svg);
	
	// Add date labels container
	const labelsContainer = document.createElement('div');
	labelsContainer.className = 'chart-labels';
	
	// Add start date
	const startLabel = document.createElement('div');
	startLabel.className = 'chart-date-label';
	startLabel.textContent = data[0].period;
	labelsContainer.appendChild(startLabel);
	
	// Add end date
	const endLabel = document.createElement('div');
	endLabel.className = 'chart-date-label';
	endLabel.textContent = data[data.length - 1].period;
	labelsContainer.appendChild(endLabel);
	
	chartContainer.appendChild(labelsContainer);
	
	// Create tooltip
	const tooltip = document.createElement('div');
	tooltip.className = 'chart-tooltip';
	tooltip.style.display = 'none';
	chartContainer.appendChild(tooltip);

	// Add invisible overlay for mouse tracking
	const overlay = document.createElement('div');
	overlay.className = 'chart-overlay';
	
	// Handle mouse movement
	overlay.addEventListener('mousemove', (e) => {
		const rect = overlay.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const relativeX = (x / rect.width) * viewBoxWidth;

		// Find closest point
		const closestPoint = points.reduce((prev, curr) => {
			const prevDist = Math.abs(prev.x - relativeX);
			const currDist = Math.abs(curr.x - relativeX);
			return currDist < prevDist ? curr : prev;
		});

		// Position tooltip
		const tooltipX = (closestPoint.x / viewBoxWidth) * rect.width;
		tooltip.style.left = `${tooltipX}px`;
		tooltip.style.top = `${(closestPoint.y / chartHeight) * rect.height}px`;
		tooltip.innerHTML = `<div class="tooltip-date">${closestPoint.date}</div><div class="tooltip-count">${closestPoint.count}</div>`;
		tooltip.style.display = 'flex';
	});

	overlay.addEventListener('mouseleave', () => {
		tooltip.style.display = 'none';
	});

	chartContainer.appendChild(overlay);
	
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
		
		switch (options.aggregation) {
			case 'day':
				periodStart = startDate.add(i, 'day');
				break;
			case 'week':
				periodStart = startDate.add(i, 'week').startOf('week');
				break;
			case 'month':
				periodStart = startDate.add(i, 'month').startOf('month');
				break;
		}
		
		const formattedDate = formatPeriodDate(periodStart, today, options);
		periodsData.set(formattedDate, 0);
	}
	
	// Count entries per period
	filteredHistory.forEach(entry => {
		const entryDate = dayjs(entry.datetime);
		let periodStart: dayjs.Dayjs;
		
		switch (options.aggregation) {
			case 'day':
				periodStart = entryDate;
				break;
			case 'week':
				periodStart = entryDate.startOf('week');
				break;
			case 'month':
				periodStart = entryDate.startOf('month');
				break;
		}
		
		const formattedDate = formatPeriodDate(periodStart, today, options);
		if (periodsData.has(formattedDate)) {
			periodsData.set(formattedDate, (periodsData.get(formattedDate) || 0) + 1);
		}
	});
	
	return Array.from(periodsData.entries()).map(([period, count]) => ({
		period,
		count
	}));
} 