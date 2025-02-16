import { BaseExtractor, ExtractorResult } from './_base';
import { convertDate } from '../date-utils';

export class YoutubeExtractor extends BaseExtractor {
	private videoElement: HTMLVideoElement | null;
	protected override schemaOrgData: any;

	constructor(document: Document, url: string, schemaOrgData?: any) {
		super(document, url, schemaOrgData);
		this.videoElement = document.querySelector('video');
		this.schemaOrgData = schemaOrgData;
	}

	canExtract(): boolean {
		return true;
	}

	private getTranscript(): string {
		// Try to find the transcript panel
		let transcriptPanel = this.document.querySelector('ytd-engagement-panel-section-list-renderer #segments-container');
		if (!transcriptPanel) {
			// Try to find and click the "Show transcript" button
			const showTranscriptButton = this.document.querySelector('button[aria-label="Show transcript"]');
			if (showTranscriptButton instanceof HTMLElement) {
				showTranscriptButton.click();
				// Try again after clicking
				transcriptPanel = this.document.querySelector('ytd-engagement-panel-section-list-renderer #segments-container');
				if (!transcriptPanel) return '';
			} else {
				return '';
			}
		}

		// Now transcriptPanel is guaranteed to be non-null
		const segments = Array.from(transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer'));
		
		// Format each segment with timestamp and text
		const formattedSegments = segments.map(segment => {
			const timestamp = segment.querySelector('.segment-timestamp')?.textContent?.trim() || '';
			const text = segment.querySelector('.segment-text')?.textContent?.trim() || '';
			
			// Create a link to the specific timestamp if we have one
			if (timestamp) {
				const timeInSeconds = this.convertTimestampToSeconds(timestamp);
				const videoId = this.getVideoId();
				return `[${timestamp}](https://youtube.com/watch?v=${videoId}&t=${timeInSeconds}s) ${text}`;
			}
			return text;
		});

		// Join segments with newlines
		return formattedSegments.join('\n');
	}

	private convertTimestampToSeconds(timestamp: string): number {
		const parts = timestamp.split(':').reverse();
		let seconds = 0;
		for (let i = 0; i < parts.length; i++) {
			seconds += parseInt(parts[i]) * Math.pow(60, i);
		}
		return seconds;
	}

	override extract(): ExtractorResult {
		const videoData = this.getVideoData();
		const description = videoData.description || '';
		const formattedDescription = this.formatDescription(description);
		const transcript = this.getTranscript();
		const contentHtml = `
			<iframe width="560" height="315" src="https://www.youtube.com/embed/${this.getVideoId()}?si=_m0qv33lAuJFoGNh" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
			<br>
			${formattedDescription}
			${transcript ? '<h2>Transcript</h2>\n\n' + transcript : ''}
		`;

		return {
			content: contentHtml,
			contentHtml: contentHtml,
			extractedContent: {
				videoId: this.getVideoId(),
				author: videoData.author || '',
				transcript: transcript || ''
			},
			variables: {
				title: videoData.name || '',
				author: videoData.author || '',
				site: 'YouTube',
				image: Array.isArray(videoData.thumbnailUrl) ? videoData.thumbnailUrl[0] || '' : '',
				published: videoData.uploadDate ? convertDate(new Date(videoData.uploadDate)) : '',
				description: description.slice(0, 200).trim(),
				transcript: transcript || ''
			}
		};
	}

	private formatDescription(description: string): string {
		return `<p>${description.replace(/\n/g, '<br>')}</p>`;
	}

	private getVideoData(): any {
		if (!this.schemaOrgData) return {};

		const videoData = Array.isArray(this.schemaOrgData)
			? this.schemaOrgData.find(item => item['@type'] === 'VideoObject')
			: this.schemaOrgData['@type'] === 'VideoObject' ? this.schemaOrgData : null;

		return videoData || {};
	}

	private getVideoId(): string {
		const urlParams = new URLSearchParams(new URL(this.url).search);
		return urlParams.get('v') || '';
	}
} 