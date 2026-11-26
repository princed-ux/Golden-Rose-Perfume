import { test } from 'node:test';

import assert from 'node:assert/strict';

import {
  PERMISSION_MODULES,
  canConfigurePermissions,
  parsePermissionOverrides,
  resolveStaffModules,
} from './staff-permissions';

/* =========================================================
   GOLDEN ROSE PERFUME
   INDIVIDUAL STAFF PERMISSION TESTS
   ========================================================= */

test(
  'cashier inherits the existing POS-only baseline',
  () => {
    assert.deepEqual(
      resolveStaffModules(
        'cashier',

        ['pos'],

        {},
      ),

      ['pos'],
    );
  },
);

test(
  'owner can grant wholesale and dispatch to one cashier without granting them to another',
  () => {
    assert.deepEqual(
      resolveStaffModules(
        'cashier',

        ['pos'],

        {
          wholesale: 'allow',

          dispatch: 'allow',
        },
      ),

      [
        'pos',
        'wholesale',
        'dispatch',
      ],
    );

    assert.deepEqual(
      resolveStaffModules(
        'cashier',

        ['pos'],

        {},
      ),

      ['pos'],
    );
  },
);

test(
  'explicit deny takes precedence over role access',
  () => {
    assert.deepEqual(
      resolveStaffModules(
        'sales_staff',

        [
          'orders',
          'products',
          'customers',
        ],

        {
          orders: 'deny',
        },
      ),

      [
        'products',
        'customers',
      ],
    );
  },
);

test(
  'owner-only permissions cannot be delegated and the owner cannot be locked out',
  () => {
    for (
      const moduleId of [
        'staff',
        'settings',
        'audit',
        'permissions',
      ]
    ) {
      assert.throws(() =>
        parsePermissionOverrides({
          [moduleId]: 'allow',
        }),
      );
    }

    assert.deepEqual(
      resolveStaffModules(
        'manager',

        [
          'permissions',
          'staff',
          'pos',
        ],

        {},
      ),

      ['pos'],
    );

    assert.deepEqual(
      resolveStaffModules(
        'owner',

        [],

        {},
      ),

      [...PERMISSION_MODULES],
    );

    assert.equal(
      canConfigurePermissions(
        'manager',
      ),

      false,
    );

    assert.equal(
      canConfigurePermissions(
        'owner',
      ),

      true,
    );
  },
);

test(
  'customers, unknown roles and malformed access data do not gain access',
  () => {
    assert.deepEqual(
      resolveStaffModules(
        'customer',

        ['pos'],

        {
          pos: 'allow',
        },
      ),

      [],
    );

    assert.deepEqual(
      resolveStaffModules(
        'sales_admin',

        ['pos'],

        {},
      ),

      [],
    );

    for (
      const value of [
        null,

        undefined,

        [],

        {
          wholesale: true,
        },

        {
          unknown: 'allow',
        },
      ]
    ) {
      assert.throws(() =>
        resolveStaffModules(
          'cashier',

          ['pos'],

          value,
        ),
      );
    }
  },
);