import type { ValueTransformer } from 'typeorm';

/** `bigint` columns come back as strings from pg (and sometimes sqlite); expose numbers (epoch ms). */
export const bigintNumber: ValueTransformer = {
	to: (v: number | null | undefined) => v,
	from: (v: string | number | null) => (v === null || v === undefined ? v : Number(v)),
};
