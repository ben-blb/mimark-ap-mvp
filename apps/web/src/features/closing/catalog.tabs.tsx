import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CreateAccountInput,
  CreateCategoryInput,
  CreateCompanyInput,
  CreateKioskInput,
  CreateRuleInput,
  EDO_RES_LINES,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateCompanyInput,
  UpdateKioskInput,
  UpdateRuleInput,
  type BankAccountDto,
  type CategoryDto,
  type CompanyDto,
  type KioskDto,
  type RuleDto,
} from '@mimark/contracts/closing';
import { MONO } from '../../app/theme';
import { ACCOUNT_TYPE_LABELS, CATEGORY_KIND_LABELS } from '../../lib/labels';
import type { TabDef } from './CatalogTab';
import { useAccounts, useCategories, useCompanies, useKiosks, useRules } from './closing.api';

type Option = { value: string; label: string };

/** Las cinco pestañas del catálogo: qué lista, qué columnas y qué formulario tiene cada una. */
export function useCatalogTabs(showInactive: boolean) {
  const companies = useCompanies(showInactive);
  const kiosks = useKiosks(showInactive);
  const accounts = useAccounts(showInactive);
  const categories = useCategories();
  const rules = useRules(showInactive);

  // Para elegir y mostrar la empresa o la categoría de un registro se usan todas, activas o no.
  const allCompanies = useCompanies(true).data?.items ?? [];
  const companyOptions: Option[] = allCompanies
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name }));
  const companyName = (id: string) => allCompanies.find((c) => c.id === id)?.name ?? '—';
  const categoryList = categories.data?.items ?? [];
  const categoryOptions: Option[] = categoryList
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name }));
  const categoryName = (id: string) => categoryList.find((c) => c.id === id)?.name ?? '—';
  const lineOptions: Option[] = EDO_RES_LINES.map((l) => ({ value: l, label: l }));
  const mono = { fontFamily: MONO, fontSize: '0.8125rem' };

  const companiesTab: TabDef<CompanyDto> = {
    resource: 'companies',
    label: 'Empresas',
    add: 'Agregar empresa',
    query: companies,
    columns: [{ label: 'Nombre', cell: (c) => c.name }],
    createSchema: CreateCompanyInput,
    updateSchema: UpdateCompanyInput,
    fields: [{ name: 'name', label: 'Nombre de la empresa o plaza' }],
    blank: { name: '' },
    toForm: (c) => ({ name: c.name, active: c.active }),
    title: (c) => c.name,
  };

  const kiosksTab: TabDef<KioskDto> = {
    resource: 'kiosks',
    label: 'Kioskos',
    add: 'Agregar kiosko',
    query: kiosks,
    columns: [
      { label: 'Nombre', cell: (k) => k.name },
      { label: 'Empresa', cell: (k) => companyName(k.companyId) },
      {
        label: 'Asset (Parlevel)',
        cell: (k) => <span style={mono}>{k.parlevelAsset ?? '—'}</span>,
      },
      {
        label: 'Device ID (Cantaloupe)',
        cell: (k) => <span style={mono}>{k.cantaloupeDeviceId ?? '—'}</span>,
      },
    ],
    createSchema: CreateKioskInput,
    updateSchema: UpdateKioskInput,
    fields: [
      { name: 'name', label: 'Nombre del kiosko' },
      { name: 'companyId', label: 'Empresa', options: companyOptions },
      { name: 'parlevelAsset', label: 'Asset de Parlevel (opcional)' },
      { name: 'cantaloupeDeviceId', label: 'Device ID de Cantaloupe (opcional)' },
    ],
    blank: {
      name: '',
      companyId: companyOptions[0]?.value ?? '',
      parlevelAsset: '',
      cantaloupeDeviceId: '',
    },
    toForm: (k) => ({
      name: k.name,
      companyId: k.companyId,
      parlevelAsset: k.parlevelAsset ?? '',
      cantaloupeDeviceId: k.cantaloupeDeviceId ?? '',
      active: k.active,
    }),
    title: (k) => k.name,
  };

  const accountsTab: TabDef<BankAccountDto> = {
    resource: 'accounts',
    label: 'Cuentas',
    add: 'Agregar cuenta',
    query: accounts,
    columns: [
      { label: 'Nombre', cell: (a) => a.name },
      { label: 'Empresa', cell: (a) => companyName(a.companyId) },
      { label: 'Tipo', cell: (a) => ACCOUNT_TYPE_LABELS[a.type] },
      { label: 'Terminación', cell: (a) => <span style={mono}>{a.last4 ?? '—'}</span> },
    ],
    createSchema: CreateAccountInput,
    updateSchema: UpdateAccountInput,
    fields: [
      { name: 'name', label: 'Nombre de la cuenta' },
      { name: 'companyId', label: 'Empresa', options: companyOptions },
      {
        name: 'type',
        label: 'Tipo',
        options: ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] })),
      },
      {
        name: 'last4',
        label: 'Últimos 4 dígitos (opcional)',
        helper: 'Nunca guardamos el número completo',
      },
    ],
    blank: { name: '', companyId: companyOptions[0]?.value ?? '', type: 'checking', last4: '' },
    toForm: (a) => ({
      name: a.name,
      companyId: a.companyId,
      type: a.type,
      last4: a.last4 ?? '',
      active: a.active,
    }),
    title: (a) => a.name,
  };

  const kindOptions = CATEGORY_KINDS.map((k) => ({ value: k, label: CATEGORY_KIND_LABELS[k] }));
  const categoriesTab: TabDef<CategoryDto> = {
    resource: 'categories',
    label: 'Categorías',
    add: 'Agregar categoría',
    query: categories,
    columns: [
      { label: 'Nombre', cell: (c) => c.name },
      { label: 'Código', cell: (c) => <span style={mono}>{c.code}</span> },
      { label: 'Renglón del EDO RES', cell: (c) => c.edoResLine },
      { label: 'Tipo', cell: (c) => CATEGORY_KIND_LABELS[c.kind] },
    ],
    createSchema: CreateCategoryInput,
    updateSchema: UpdateCategoryInput,
    fields: [
      { name: 'name', label: 'Nombre' },
      {
        name: 'code',
        label: 'Código',
        helper: 'Mayúsculas y guiones bajos, p. ej. SEGURIDAD. No se puede cambiar después',
      },
      { name: 'edoResLine', label: 'Renglón del EDO RES', options: lineOptions },
      { name: 'kind', label: 'Tipo', options: kindOptions },
    ],
    blank: { name: '', code: '', edoResLine: EDO_RES_LINES[0], kind: 'expense' },
    toForm: (c) => ({
      name: c.name,
      edoResLine: c.edoResLine,
      kind: c.kind,
      active: c.active,
    }),
    title: (c) => c.name,
  };

  const rulesTab: TabDef<RuleDto> = {
    resource: 'rules',
    label: 'Reglas',
    add: 'Agregar regla',
    query: rules,
    columns: [
      { label: 'Patrón', cell: (r) => <span style={mono}>{r.pattern}</span> },
      { label: 'Categoría', cell: (r) => categoryName(r.categoryId) },
      { label: 'Prioridad', cell: (r) => r.priority },
    ],
    createSchema: CreateRuleInput,
    updateSchema: UpdateRuleInput,
    fields: [
      {
        name: 'pattern',
        label: 'Patrón',
        helper: 'Texto que aparece en el concepto; no distingue mayúsculas ni acentos',
      },
      { name: 'categoryId', label: 'Categoría', options: categoryOptions },
      {
        name: 'priority',
        label: 'Prioridad',
        type: 'number',
        helper: 'Gana la mayor; con igual prioridad, el patrón más largo',
      },
    ],
    blank: { pattern: '', categoryId: categoryOptions[0]?.value ?? '', priority: '0' },
    toForm: (r) => ({
      pattern: r.pattern,
      categoryId: r.categoryId,
      priority: String(r.priority),
      active: r.active,
    }),
    title: (r) => r.pattern,
  };

  return {
    companies: companiesTab,
    kiosks: kiosksTab,
    accounts: accountsTab,
    categories: categoriesTab,
    rules: rulesTab,
  };
}
