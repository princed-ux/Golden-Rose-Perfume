import { test } from 'node:test';

import assert from 'node:assert/strict';

import {
  delegatedNavigation,
} from './workspace-delegation';

import {
  canViewModule,
} from './permissions';

const cashier = {
  userId: 'cashier-1',
  role: 'cashier',
};

const owner = {
  userId: 'owner-1',
  role: 'owner',
};

const granted = {
  ...cashier,

  wholesaleAllowed: true,
  dispatchAllowed: true,
  invoiceAllowed: true,
  assistantAllowed: true,
};

/* =========================================================
   INDIVIDUAL EMPLOYEE ACCESS
   ========================================================= */

test(
  'an authorized cashier receives all granted modules without changing role',
  () => {
    assert.deepEqual(
      delegatedNavigation(cashier, granted),

      [
        'wholesale',
        'dispatch',
        'invoices',
      ],
    );

    assert.equal(
      cashier.role,
      'cashier',
    );
  },
);

test(
  'another cashier does not inherit permissions granted to a different employee',
  () => {
    assert.deepEqual(
      delegatedNavigation(
        {
          userId: 'cashier-2',
          role: 'cashier',
        },
        granted,
      ),

      [],
    );
  },
);

/* =========================================================
   INDEPENDENT PERMISSION SWITCHES
   ========================================================= */

test(
  'each individual module can be switched off independently',
  () => {
    assert.deepEqual(
      delegatedNavigation(
        cashier,
        {
          ...granted,
          invoiceAllowed: false,
        },
      ),

      [
        'wholesale',
        'dispatch',
      ],
    );

    assert.deepEqual(
      delegatedNavigation(
        cashier,
        {
          ...granted,
          dispatchAllowed: false,
          invoiceAllowed: false,
        },
      ),

      ['wholesale'],
    );

    assert.deepEqual(
      delegatedNavigation(
        cashier,
        {
          ...granted,
          wholesaleAllowed: false,
          dispatchAllowed: false,
        },
      ),

      ['invoices'],
    );
  },
);

/* =========================================================
   ROLE DEFAULT REVOCATION
   ========================================================= */

test(
  'an accountant can have invoice access explicitly revoked',
  () => {
    const accountant = {
      userId: 'accountant-1',
      role: 'accountant',
    };

    assert.equal(
      canViewModule('accountant', 'invoices'),
      true,
    );

    assert.deepEqual(
      delegatedNavigation(
        accountant,
        {
          ...accountant,
          wholesaleAllowed: false,
          dispatchAllowed: false,
          invoiceAllowed: false,
          assistantAllowed: true,
        },
      ),

      [],
    );
  },
);

/* =========================================================
   DELEGATED DISPATCH
   ========================================================= */

test(
  'inventory staff can receive delegated dispatch access without becoming a cashier',
  () => {
    const employee = {
      userId: 'inventory-1',
      role: 'inventory_staff',
    };

    assert.deepEqual(
      delegatedNavigation(
        employee,
        {
          ...employee,
          wholesaleAllowed: false,
          dispatchAllowed: true,
          invoiceAllowed: false,
          assistantAllowed: true,
        },
      ),

      ['dispatch'],
    );
  },
);

/* =========================================================
   FAIL-CLOSED PERMISSION VALIDATION
   ========================================================= */

test(
  'missing and malformed permission responses grant no additional modules',
  () => {
    for (
      const value of [
        null,

        undefined,

        [],

        {},

        {
          ...granted,
          invoiceAllowed: 'true',
        },

        {
          ...granted,
          role: 'manager',
        },

        {
          ...granted,
          assistantAllowed: false,
        },
      ]
    ) {
      assert.deepEqual(
        delegatedNavigation(cashier, value),

        [],
      );
    }
  },
);

/* =========================================================
   OWNER-ONLY PERMISSION ADMINISTRATION
   ========================================================= */

test(
  'permission administration is available only to the business owner',
  () => {
    assert.deepEqual(
      delegatedNavigation(owner, null),

      ['permissions'],
    );

    assert.deepEqual(
      delegatedNavigation(
        owner,
        {
          ...owner,
          wholesaleAllowed: true,
          dispatchAllowed: true,
          invoiceAllowed: true,
          assistantAllowed: true,
        },
      ),

      [
        'wholesale',
        'dispatch',
        'invoices',
        'permissions',
      ],
    );

    assert.equal(
      delegatedNavigation(
        cashier,
        granted,
      ).includes('permissions'),

      false,
    );
  },
);

/* =========================================================
   AMARA AVAILABILITY
   ========================================================= */

test(
  'Amara is available to every internal employee role',
  () => {
    const roles = [
      'owner',
      'manager',
      'cashier',
      'inventory_staff',
      'sales_staff',
      'accountant',
    ] as const;

    for (const role of roles) {
      assert.equal(
        canViewModule(role, 'assistant'),

        true,
      );
    }
  },
);

/* =========================================================
   CUSTOMER PROTECTION
   ========================================================= */

test(
  'customers and unknown roles cannot obtain internal navigation',
  () => {
    for (
      const role of [
        'customer',
        'unknown',
      ]
    ) {
      const identity = {
        userId: 'customer-1',
        role,
      };

      assert.deepEqual(
        delegatedNavigation(
          identity,
          {
            ...identity,
            wholesaleAllowed: true,
            dispatchAllowed: true,
            invoiceAllowed: true,
            assistantAllowed: true,
          },
        ),

        [],
      );
    }

    assert.equal(
      canViewModule('customer', 'assistant'),

      false,
    );
  },
);