import { list } from './list'


describe('list filter', () => {
	it('can convert array to a bulleted list', () => {
		expect(list('["one", "two", "three"]')).toBe('- one\n- two\n- three');
		expect(list(["one", "two", "three"])).toBe('- one\n- two\n- three');
		expect(list(["one"])).toBe('- one');
		expect(list('["one"]')).toBe('- one');
	});
	it('can convert array to a task list', () => {
		expect(list('["one", "two", "three"]', 'task')).toBe('- [ ] one\n- [ ] two\n- [ ] three');
		expect(list(["one", "two", "three"], 'task')).toBe('- [ ] one\n- [ ] two\n- [ ] three');
		expect(list(["one"], 'task')).toBe('- [ ] one');
		expect(list('["one"]', 'task')).toBe('- [ ] one');
	});
	it('can convert array to a task list with numbers', () => {
		expect(list('["one", "two", "three"]', 'numbered-task')).toBe('1. [ ] one\n2. [ ] two\n3. [ ] three');
		expect(list(["one", "two", "three"], 'numbered-task')).toBe('1. [ ] one\n2. [ ] two\n3. [ ] three');
		expect(list(["one"], 'numbered-task')).toBe('1. [ ] one');
		expect(list('["one"]', 'numbered-task')).toBe('1. [ ] one');
	});
});
