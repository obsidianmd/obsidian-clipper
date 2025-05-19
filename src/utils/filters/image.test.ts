import { image } from './image'


describe('image filter', () => {
	it('can create from single image string', () => {
		expect(image('image.jpg', 'alt text')).toBe('![alt text](image.jpg)');
	});
	it('can create from array', () => {
		expect(image('["image1.jpg","image2.jpg"]', 'alt text')).toEqual(['![alt text](image1.jpg)', '![alt text](image2.jpg)']);
	});
	it('can create from object', () => {
		expect(image('{"image1.jpg": "Alt 1", "image2.jpg": "Alt 2"}')).toEqual(['![Alt 1](image1.jpg)', '![Alt 2](image2.jpg)']);
	});
});
