import dayjs from 'dayjs';
import { HistoryEntry } from '../types/types';
import { getMessage } from '../utils/i18n';

interface WeeklyUsage {
	period: string;
	count: number;
	totalCount?: number;
}

interface ChartOptions {
	timeRange: '30d' | 'all';
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
	// Calculate total clips for the period
	const totalClips = data[0].totalCount !== undefined ? data[0].totalCount : 
		data.reduce((sum, d) => sum + d.count, 0);
	
	// Hide chart container if less than 20 items
	const usageContainer = document.getElementById('usage-chart-container');
	if (usageContainer && totalClips < 20) {
		usageContainer.style.display = 'none';
		return;
	} else if (usageContainer) {
		usageContainer.style.display = 'block';
	}

	const description = document.querySelector('.usage-chart-title .setting-item-description');
	if (description) {
		const message = totalClips === 1 ? getMessage('pagesSaved') : getMessage('pagesSavedPlural');
		description.textContent = `${totalClips} ${message}`;
	}

	// Clear existing chart content
	container.textContent = '';
	container.classList.add('usage-chart');

	const maxCount = Math.max(...data.map(d => d.count));
	const chartHeight = 80;
	const barGap = 4;

	// Create chart container
	const lineContainer = document.createElement('div');
	lineContainer.className = 'chart-line';
	
	// Create SVG for line chart
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', '100%');
	const viewBoxWidth = 1000;
	svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${chartHeight}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.style.marginLeft = `${barGap/2}px`;
	svg.style.marginRight = `${barGap/2}px`;
	
	// Create vertical line for cursor tracking
	const verticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	verticalLine.classList.add('chart-vertical-line');
	verticalLine.setAttribute('y1', '0');
	verticalLine.setAttribute('y2', chartHeight.toString());
	verticalLine.style.display = 'none';
	svg.appendChild(verticalLine);
	
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
	lineContainer.appendChild(svg);
	
	// Date labels
	const labelsContainer = document.createElement('div');
	labelsContainer.className = 'chart-labels';

	const startLabel = document.createElement('div');
	startLabel.className = 'chart-date-label';
	startLabel.textContent = data[0].period;
	labelsContainer.appendChild(startLabel);

	const endLabel = document.createElement('div');
	endLabel.className = 'chart-date-label';
	endLabel.textContent = data[data.length - 1].period;
	labelsContainer.appendChild(endLabel);
	
	lineContainer.appendChild(labelsContainer);
	
	// Tooltip
	const tooltip = document.createElement('div');
	tooltip.className = 'chart-tooltip';
	tooltip.style.display = 'none';
	lineContainer.appendChild(tooltip);

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

		tooltip.textContent = '';
		
		const dateDiv = document.createElement('div');
		dateDiv.className = 'tooltip-date';
		dateDiv.textContent = closestPoint.date;
		tooltip.appendChild(dateDiv);
		
		const countDiv = document.createElement('div');
		countDiv.className = 'tooltip-count';
		countDiv.textContent = closestPoint.count.toString();
		tooltip.appendChild(countDiv);
		tooltip.style.display = 'flex';

		// Calculate smooth transform offset based on position
		const position = x / rect.width; // 0 to 1
		const minOffset = 10; // leftmost offset (%)
		const maxOffset = -110; // rightmost offset (%)
		const offset = minOffset + (maxOffset - minOffset) * position;
		
		tooltip.style.transform = `translate(${offset}%, 0)`;
		tooltip.style.left = `${x}px`;
		tooltip.style.top = `${e.clientY - rect.top - 30}px`;

		// Update vertical line position
		verticalLine.setAttribute('x1', relativeX.toString());
		verticalLine.setAttribute('x2', relativeX.toString());
		verticalLine.style.display = 'block';
	});

	overlay.addEventListener('mouseleave', () => {
		tooltip.style.display = 'none';
		verticalLine.style.display = 'none';
	});

	lineContainer.appendChild(overlay);
	container.appendChild(lineContainer);
}

export function aggregateUsageData(history: HistoryEntry[], options: ChartOptions): WeeklyUsage[] {
	const periodsData = new Map<string, number>();
	const today = dayjs();
	
	// Sort history by datetime in ascending order
	const sortedHistory = [...history].sort((a, b) => 
		dayjs(a.datetime).valueOf() - dayjs(b.datetime).valueOf()
	);
	
	if (sortedHistory.length === 0) {
		return [{
			period: formatPeriodDate(today, today, options),
			count: 0
		}];
	}

	let displayStartDate: dayjs.Dayjs;
	let displayPeriods: number;

	if (options.timeRange === 'all') {
		// For "all time", start from the earliest entry
		const earliest = dayjs(sortedHistory[0].datetime);
		displayStartDate = earliest.startOf(options.aggregation);
		displayPeriods = today.diff(displayStartDate, options.aggregation) + 1;
	} else {
		// Only 30d option remains
		displayStartDate = today.subtract(29, 'day').startOf('day');
		displayPeriods = options.aggregation === 'day' ? 30 : 
			options.aggregation === 'week' ? 5 : 2;
	}

	// Initialize display periods with 0 counts
	for (let i = 0; i < displayPeriods; i++) {
		let periodStart = displayStartDate.add(i, options.aggregation);
		if (options.aggregation !== 'day') {
			periodStart = periodStart.startOf(options.aggregation);
		}
		const formattedDate = formatPeriodDate(periodStart, today, options);
		periodsData.set(formattedDate, 0);
	}

	// Count all entries
	sortedHistory.forEach(entry => {
		const entryDate = dayjs(entry.datetime);
		if (options.timeRange !== 'all' && 
			(entryDate.isBefore(displayStartDate) || entryDate.isAfter(today))) {
			return;
		}

		let periodStart = entryDate;
		if (options.aggregation !== 'day') {
			periodStart = periodStart.startOf(options.aggregation);
		}
		
		const formattedDate = formatPeriodDate(periodStart, today, options);
		if (periodsData.has(formattedDate)) {
			periodsData.set(formattedDate, (periodsData.get(formattedDate) || 0) + 1);
		}
	});

	return Array.from(periodsData.entries()).map(([period, count]) => ({
		period,
		count,
		totalCount: sortedHistory.length
	}));
} 