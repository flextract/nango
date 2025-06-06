import { Err, Ok } from '@nangohq/utils';

import { FleetError } from '../utils/errors.js';

import type { NodeConfigOverride } from '../types.js';
import type { RoutingId } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export const NODE_CONFIG_OVERRIDES_TABLE = 'node_config_overrides';

interface DBNodeConfigOverride {
    readonly id: number;
    readonly routing_id: RoutingId;
    readonly image: string | null;
    readonly cpu_milli: number | null;
    readonly memory_mb: number | null;
    readonly storage_mb: number | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}

const DBNodeConfigOverride = {
    to: (nodeConfigOverride: NodeConfigOverride): DBNodeConfigOverride => {
        return {
            id: nodeConfigOverride.id,
            routing_id: nodeConfigOverride.routingId,
            image: nodeConfigOverride.image,
            cpu_milli: nodeConfigOverride.cpuMilli,
            memory_mb: nodeConfigOverride.memoryMb,
            storage_mb: nodeConfigOverride.storageMb,
            created_at: nodeConfigOverride.createdAt,
            updated_at: nodeConfigOverride.updatedAt
        };
    },
    from: (dbNodeConfigOverride: DBNodeConfigOverride): NodeConfigOverride => {
        return {
            id: dbNodeConfigOverride.id,
            routingId: dbNodeConfigOverride.routing_id,
            image: dbNodeConfigOverride.image,
            cpuMilli: dbNodeConfigOverride.cpu_milli,
            memoryMb: dbNodeConfigOverride.memory_mb,
            storageMb: dbNodeConfigOverride.storage_mb,
            createdAt: dbNodeConfigOverride.created_at,
            updatedAt: dbNodeConfigOverride.updated_at
        };
    }
};

export async function upsert(
    db: knex.Knex,
    props: Partial<Omit<NodeConfigOverride, 'createdAt' | 'updatedAt'>> & Required<Pick<NodeConfigOverride, 'routingId'>>
): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const now = new Date();

        const toInsert: Omit<DBNodeConfigOverride, 'id'> = {
            routing_id: props.routingId,
            image: props.image ?? null,
            cpu_milli: props.cpuMilli ?? null,
            memory_mb: props.memoryMb ?? null,
            storage_mb: props.storageMb ?? null,
            created_at: now,
            updated_at: now
        };

        const toUpdateOnConflict: Partial<DBNodeConfigOverride> = {
            ...(props.image !== undefined ? { image: props.image } : {}),
            ...(props.cpuMilli !== undefined ? { cpu_milli: props.cpuMilli } : {}),
            ...(props.memoryMb !== undefined ? { memory_mb: props.memoryMb } : {}),
            ...(props.storageMb !== undefined ? { storage_mb: props.storageMb } : {}),
            updated_at: now
        };

        const [resultRow] = await db
            .from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE)
            .insert(toInsert)
            .onConflict('routing_id')
            .merge(toUpdateOnConflict)
            .returning('*');

        if (!resultRow) {
            return Err(new FleetError('node_config_override_upsert_failed', { context: props }));
        }
        return Ok(DBNodeConfigOverride.from(resultRow));
    } catch (err) {
        return Err(new FleetError('node_config_override_upsert_failed', { cause: err, context: props }));
    }
}

export async function remove(db: knex.Knex, routingId: RoutingId): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const [deleted] = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).delete().where({ routing_id: routingId }).returning('*');
        if (!deleted) {
            return Err(new FleetError('node_config_override_not_found', { context: { routingId } }));
        }
        return Ok(DBNodeConfigOverride.from(deleted));
    } catch (err) {
        return Err(new FleetError('node_config_override_delete_failed', { cause: err, context: { routingId } }));
    }
}

export async function get(db: knex.Knex, routingId: RoutingId): Promise<Result<NodeConfigOverride, FleetError>> {
    try {
        const nodeConfigOverride = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).select('*').where({ routing_id: routingId }).first();
        if (!nodeConfigOverride) {
            return Err(new FleetError('node_config_override_not_found', { context: { routingId } }));
        }
        return Ok(DBNodeConfigOverride.from(nodeConfigOverride));
    } catch (err) {
        return Err(new FleetError('node_config_override_get_failed', { cause: err, context: { routingId } }));
    }
}

export async function search(
    db: knex.Knex,
    params: {
        routingIds?: RoutingId[];
        forUpdate?: boolean;
    }
): Promise<Result<Map<RoutingId, NodeConfigOverride>, FleetError>> {
    try {
        const query = db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).select('*');
        if (params.routingIds) {
            query.whereIn('routing_id', params.routingIds);
        }
        if (params.forUpdate) {
            query.forUpdate();
        }
        const nodeConfigOverrides = await query;
        const nodeConfigOverridesMap = new Map<RoutingId, NodeConfigOverride>();
        for (const nodeConfigOverride of nodeConfigOverrides) {
            nodeConfigOverridesMap.set(nodeConfigOverride.routing_id, DBNodeConfigOverride.from(nodeConfigOverride));
        }
        return Ok(nodeConfigOverridesMap);
    } catch (err) {
        return Err(new FleetError('node_config_override_search_failed', { cause: err, context: { params } }));
    }
}

export async function resetImage(db: knex.Knex): Promise<Result<NodeConfigOverride[], FleetError>> {
    try {
        const toUpdate: Partial<DBNodeConfigOverride> = {
            image: null
        };
        const updated = await db.from<DBNodeConfigOverride>(NODE_CONFIG_OVERRIDES_TABLE).update(toUpdate).returning('*');
        if (!updated) {
            return Err(new FleetError('node_config_override_reset_image_failed'));
        }
        return Ok(updated.map(DBNodeConfigOverride.from));
    } catch (err) {
        return Err(new FleetError('node_config_override_reset_image_failed', { cause: err }));
    }
}
