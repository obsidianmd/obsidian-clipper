import { describe, test, expect } from 'vitest';
import { boss_decrypt } from './boss_decrypt';

describe('boss_decrypt filter', () => {
        test('decrypts single character obfuscated font', () => {
                expect(boss_decrypt('\ue032')).toBe('1');
        });

        test('decrypts full salary string', () => {
                // '\ue033\ue034K' should be '23K'
                expect(boss_decrypt('\ue033\ue034K')).toBe('23K');
        });

        test('decrypts complex salary range', () => {
                // '\ue033\ue034-\ue035\ue036K' should be '23-45K'
                expect(boss_decrypt('\ue033\ue034-\ue035\ue036K')).toBe('23-45K');
        });

        test('handles mixed normal and obfuscated characters', () => {
                expect(boss_decrypt('薪资: \ue037\ue038K')).toBe('薪资: 67K');
        });

        test('handles empty string', () => {
                expect(boss_decrypt('')).toBe('');
        });

        test('handles array of strings', () => {
                expect(boss_decrypt(['\ue032', '\ue033'])).toEqual(['1', '2']);
        });

        test('handles non-obfuscated text', () => {
                expect(boss_decrypt('Normal Text 123')).toBe('Normal Text 123');
        });
});
