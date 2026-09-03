import { describe, expect, it } from 'vitest';

import { detectIdentifiers } from '../../src/identifiers/detector';

describe('detectIdentifiers', () => {

    it('should detect a CURP', () => {
        const result = detectIdentifiers(
            'AEAM860405HDFNNR05'
        );

        expect(result).toEqual([
            {
                value: 'AEAM860405HDFNNR05',
                type: 'CURP',
            },
        ]);
    });

    it('should detect an RFC', () => {
        const result = detectIdentifiers(
            'BOPL8504159T1'
        );

        expect(result).toEqual([
            {
                value: 'BOPL8504159T1',
                type: 'RFC',
            },
        ]);
    });

    it('should detect multiple identifiers in one message', () => {
        const result = detectIdentifiers(`
            AEAM860405HDFNNR05
            BOPL8504159T1
        `);

        expect(result).toEqual([
            {
                value: 'AEAM860405HDFNNR05',
                type: 'CURP',
            },
            {
                value: 'BOPL8504159T1',
                type: 'RFC',
            },
        ]);
    });

    it('should ignore messages without identifiers', () => {
        const result = detectIdentifiers(
            'Hello, please process these documents.'
        );

        expect(result).toEqual([]);
    });

    it('should detect identifiers surrounded by normal text', () => {
        const result = detectIdentifiers(
            'Please process AEAM860405HDFNNR05 and BOPL8504159T1 today.'
        );

        expect(result).toEqual([
            {
                value: 'AEAM860405HDFNNR05',
                type: 'CURP',
            },
            {
                value: 'BOPL8504159T1',
                type: 'RFC',
            },
        ]);
    });

    it('should normalize lowercase identifiers', () => {
        const result = detectIdentifiers(
            'aeam860405hdfnnr05'
        );

        expect(result).toEqual([
            {
                value: 'AEAM860405HDFNNR05',
                type: 'CURP',
            },
        ]);
    });

});