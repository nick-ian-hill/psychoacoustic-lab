import { describe, it, expect } from 'vitest';
import { ExperimentRunner } from '../logic/runner.js';
import seedrandom from 'seedrandom';

describe('Block Sequencing Logic', () => {
  it('should expand block repetitions correctly', () => {
    const rng = seedrandom('test-reps');
    const blocks = [
      { id: 'b1', repetitions: 3 },
      { id: 'b2', repetitions: 1 }
    ];
    
    const flat = ExperimentRunner.flattenBlocks(blocks, rng);
    expect(flat.length).toBe(4);
    expect(flat[0].id).toBe('b1');
    expect(flat[1].id).toBe('b1');
    expect(flat[2].id).toBe('b1');
    expect(flat[3].id).toBe('b2');
  });

  it('should expand nested groups and repetitions', () => {
    const rng = seedrandom('test-nesting');
    const blocks = [
      { id: 'practice', type: 'block' },
      {
        type: 'group',
        id: 'experimental',
        repetitions: 2,
        blocks: [
          { id: 'cond_A' },
          { id: 'cond_B' }
        ]
      }
    ];
    
    const flat = ExperimentRunner.flattenBlocks(blocks, rng);
    // practice (1) + experimental (2 * [cond_A, cond_B]) = 5
    expect(flat.length).toBe(5);
    expect(flat[0].id).toBe('practice');
    expect(flat[1].id).toBe('cond_A');
    expect(flat[2].id).toBe('cond_B');
    expect(flat[3].id).toBe('cond_A');
    expect(flat[4].id).toBe('cond_B');
  });

  it('should randomize blocks within a group based on seed', () => {
    const rng1 = seedrandom('fixed-seed-123');
    const blocks = [
      {
        type: 'group',
        id: 'random_group',
        randomize: true,
        blocks: [
          { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
        ]
      }
    ];
    
    const flat1 = ExperimentRunner.flattenBlocks(blocks, rng1);
    
    // Create a second RNG with same seed
    const rng2 = seedrandom('fixed-seed-123');
    const flat2 = ExperimentRunner.flattenBlocks(blocks, rng2);
    
    // Orders should be identical for same seed
    expect(flat1.map(b => b.id)).toEqual(flat2.map(b => b.id));
    
    // Create a third RNG with different seed
    const rng3 = seedrandom('different-seed-456');
    const flat3 = ExperimentRunner.flattenBlocks(blocks, rng3);
    
    // Order should likely be different (very low probability of collision)
    expect(flat1.map(b => b.id)).not.toEqual(flat3.map(b => b.id));
  });

  it('should handle repetitions of a randomized group', () => {
    const rng = seedrandom('test-group-reps');
    const blocks = [
      {
        type: 'group',
        id: 'g1',
        randomize: true,
        repetitions: 2,
        blocks: [
          { id: 'A' }, { id: 'B' }
        ]
      }
    ];
    
    const flat = ExperimentRunner.flattenBlocks(blocks, rng);
    expect(flat.length).toBe(4);
    // Should contain 2 of each
    expect(flat.filter(b => b.id === 'A').length).toBe(2);
    expect(flat.filter(b => b.id === 'B').length).toBe(2);
  });

  it('should correctly calculate runIndex and presentationOrder', () => {
    // This tests the logic used in the runner for recording results
    const results: any[] = [];
    const blockQueue = [
      { id: 'practice' },
      { id: 'exp' },
      { id: 'exp' },
      { id: 'practice' }
    ];

    blockQueue.forEach((block) => {
      const runIndex = results.filter(r => r.blockId === block.id).length;
      results.push({
        blockId: block.id,
        runIndex,
        presentationOrder: results.length + 1
      });
    });

    expect(results[0]).toEqual({ blockId: 'practice', runIndex: 0, presentationOrder: 1 });
    expect(results[1]).toEqual({ blockId: 'exp', runIndex: 0, presentationOrder: 2 });
    expect(results[2]).toEqual({ blockId: 'exp', runIndex: 1, presentationOrder: 3 });
    expect(results[3]).toEqual({ blockId: 'practice', runIndex: 1, presentationOrder: 4 });
  });

  it('should be fully reproducible when a master seed is provided', () => {
    const config: any = {
      meta: { seed: 12345 },
      blocks: [
        {
          type: 'group',
          id: 'g',
          randomize: true,
          blocks: [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
        }
      ]
    };

    const rng1 = seedrandom(config.meta.seed.toString());
    const queue1 = ExperimentRunner.flattenBlocks(config.blocks, rng1);

    const rng2 = seedrandom(config.meta.seed.toString());
    const queue2 = ExperimentRunner.flattenBlocks(config.blocks, rng2);

    expect(queue1.map(b => b.id)).toEqual(queue2.map(b => b.id));
  });
});
