// 规则常量 —— 来源：
//   [前端] table.nju.edu.cn universal-app/main.js?version=6.2.52 中的常量对象
//   [样本] 35 个真实应用配置统计出的字段目录（.cache/inbox/schema_catalog.json）
//   [官方] SeaTable 官方前端库 dtable-utils 5.0（npm）

// [前端] jr = {TABLE, FORM, ...}
export const PAGE_TYPES = [
  'table', 'form', 'gallery', 'calendar', 'custom_page', 'kanban', 'timeline',
  'data_search', 'map_cn', 'map', 'single_record_page', 'html_page',
];
// 需要绑定 table_id 的页面类型（custom_page / html_page 是自定义内容）
export const TABLE_BOUND_PAGE_TYPES = PAGE_TYPES.filter((t) => !['custom_page', 'html_page'].includes(t));

// [前端] P = {CONTAINS:"contains", ...}
export const FILTER_PREDICATES = [
  'contains', 'does_not_contain', 'is', 'is_not', 'equal', 'not_equal', 'less', 'greater',
  'less_or_equal', 'greater_or_equal', 'is_empty', 'is_not_empty', 'is_within', 'is_before',
  'is_after', 'is_on_or_before', 'is_on_or_after', 'has_any_of', 'has_all_of', 'has_none_of',
  'is_exactly', 'include_me', 'is_current_user_ID', 'is_any_of', 'is_none_of',
];

// [官方] dtable-utils 5.0 constants/filter/filter-column-options.js：各列类型可用的过滤条件
// formula / link-formula / link 按结果类型判断，这里不检查
const TEXT_P = ['contains', 'does_not_contain', 'is', 'is_not', 'is_empty', 'is_not_empty', 'is_current_user_ID'];
const NUMBER_P = ['equal', 'not_equal', 'less', 'greater', 'less_or_equal', 'greater_or_equal', 'is_empty', 'is_not_empty'];
const DATE_P = ['is', 'is_within', 'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_not', 'is_empty', 'is_not_empty'];
const SELECT_P = ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'];
const MULTI_P = ['has_any_of', 'has_all_of', 'has_none_of', 'is_exactly', 'is_empty', 'is_not_empty'];
const USER_P = ['contains', 'does_not_contain', 'include_me', 'is', 'is_not'];
const EMPTY_P = ['is_empty', 'is_not_empty'];
export const FILTER_PREDICATES_BY_TYPE = {
  text: TEXT_P, number: NUMBER_P, checkbox: ['is'], date: DATE_P, ctime: DATE_P, mtime: DATE_P,
  'single-select': SELECT_P, 'department-single-select': SELECT_P, 'multiple-select': MULTI_P,
  collaborator: [...MULTI_P, 'include_me'], creator: USER_P, 'last-modifier': USER_P,
  geolocation: TEXT_P.filter((p) => p !== 'is_current_user_ID'),
  'auto-number': ['contains', 'does_not_contain', 'is', 'is_not'],
  email: TEXT_P.slice(0, 6), url: TEXT_P.slice(0, 6),
  image: EMPTY_P, file: EMPTY_P, 'long-text': EMPTY_P, 'digital-sign': EMPTY_P,
  duration: NUMBER_P, rate: NUMBER_P,
};

// [前端] k = [CTIME, MTIME, CREATOR, LAST_MODIFIER, FORMULA, AUTO_NUMBER, BUTTON, LINK_FORMULA]
export const COMPUTED_COLUMN_TYPES = [
  'ctime', 'mtime', 'creator', 'last-modifier', 'formula', 'auto-number', 'button', 'link-formula',
];

// [前端] T = 支持"默认值"的列类型
export const DEFAULT_VALUE_COLUMN_TYPES = [
  'text', 'number', 'single-select', 'rate', 'checkbox', 'long-text', 'date', 'collaborator',
  'department-single-select',
];

// [前端] CellType：平台支持的列类型（注意是连字符，"single_select" 这类写法平台不校验但列会损坏）
export const COLUMN_TYPES = [
  'number', 'text', 'checkbox', 'date', 'single-select', 'long-text', 'image', 'file', 'multiple-select',
  'collaborator', 'link', 'formula', 'link-formula', 'creator', 'ctime', 'last-modifier', 'mtime',
  'geolocation', 'auto-number', 'url', 'email', 'duration', 'button', 'rate', 'digital-sign',
  'department-single-select',
];

export const NAV_TYPES = ['page', 'folder', 'external_link'];
export const STATIC_ELEMENT_TYPES = ['split_line', 'remarks'];
export const PERMISSION_TYPES = ['default', 'admins', 'specific_roles', 'none'];

// [前端] 各页面类型构造函数里的默认 page_permissions：该类型支持哪些权限项
const V = 'view_rows_permission', A = 'add_rows_permission', E = 'edit_rows_permission', D = 'delete_rows_permission';
export const PAGE_PERMISSIONS = {
  table: [A, E, D, V], gallery: [A, E, D, V], kanban: [A, E, D, V], calendar: [A, E, V],
  timeline: [E, V], single_record_page: [E, V],
  form: [V], data_search: [V], custom_page: [V], html_page: [V], map: [V], map_cn: [V],
};

// [前端] 各页面类型构造函数读取的字段（map / map_cn / html_page 未整理，不检查）
const PAGE_COMMON = ['id', 'name', 'type', 'icon', 'table_id', 'page_permissions', 'trigger_workflow_option'];
export const PAGE_TYPE_KEYS = {
  table: ['filter_conjunction', 'filters', 'sorts', 'shown_column_keys', 'read_only_column_keys', 'groupbys',
    'groups_display_status', 'row_height', 'link_columns_settings', 'add_duplicate_record_setting',
    'check_new_record_format', 'show_cell_coloring', 'can_export_to_excel'],
  form: ['form_column_description_color', 'success_message_option', 'add_duplicate_record_setting',
    'static_elements', 'elements_order', 'columns', 'enable_redirect', 'redirect_config',
    'is_redirect_address_after_submission', 'redirect_address_url'],
  gallery: ['shown_title_column_key', 'shown_image_column_key', 'filter_conjunction', 'filters', 'sorts',
    'shown_column_keys', 'display_field_name', 'fields_shown_setting', 'link_columns_settings'],
  calendar: ['column_title', 'column_start_date', 'column_end_date', 'column_color', 'week_start',
    'start_year_first_week', 'columns', 'shown_column_keys', 'link_columns_settings', 'filters', 'filter_conjunction'],
  kanban: ['groupby_column_name', 'title_column_name', 'filter_conjunction', 'filters', 'sorts', 'shown_column_keys',
    'link_columns_settings', 'hideEmptyValues', 'showFieldNames', 'wrapText', 'columns'],
  timeline: ['colored_by_row_color', 'record_end_type', 'single_select_column_name', 'label_column_name',
    'start_time_column_name', 'end_time_column_name', 'record_duration_column_name', 'gridStartDate', 'gridEndDate',
    'link_columns_settings', 'filter_conjunction', 'filters', 'shown_column_keys', 'columns', 'sorts'],
  data_search: ['columns_key', 'column_key', 'enable_fuzzy_query', 'case_sensitive', 'hidden_columns', 'pre_filters',
    'pre_filter_conjunction', 'pre_sorts', 'shown_column_keys', 'filters', 'enable_sort_by_column', 'sort_column_key',
    'sort_type', 'is_note_show', 'note', 'is_query_result_editable'],
  single_record_page: ['shown_column_keys', 'pre_filter_conjunction', 'pre_filters', 'pre_sorts', 'content_url',
    'read_only_column_keys', 'link_columns_settings', 'is_hidden_top_bar', 'is_hidden_toolbar', 'style'],
  custom_page: ['content_url', 'background_color', 'is_hidden_top_bar', 'style', 'enable_print_page'],
};
for (const t of Object.keys(PAGE_TYPE_KEYS)) PAGE_TYPE_KEYS[t] = [...PAGE_COMMON, ...PAGE_TYPE_KEYS[t]];
export const SORT_TYPES = ['up', 'down'];
export const CONJUNCTIONS = ['And', 'Or'];

// 各对象允许出现的字段（[样本] 并集）；出现其他字段时给出"未知字段"警告
export const KNOWN_KEYS = {
  root: [
    'app_type', 'app_name', 'settings', 'version', 'app_icon', 'app_theme_color', 'app_theme_mode',
    'icon_class_name', 'use_custom_icon', 'enable_load_base_comments', 'enable_collaborator_fields',
    'auto_archive_to_big_data', 'auto_archive_table_ids', 'can_anonymous_access',
    'can_anonymous_download_assets', 'anonymous_access_password', 'is_anonymous_need_password',
    'is_open_register', 'authed_role_id', 'collapse_navigation_by_default',
  ],
  settings: ['pages', 'navigation', 'nav_sections', 'links'],
  page: [
    'id', 'name', 'type', 'icon', 'table_id', 'page_permissions', 'trigger_workflow_option',
    'columns', 'elements_order', 'static_elements', 'add_duplicate_record_setting',
    'form_column_description_color', 'success_message_option', 'check_new_record_format',
    'enable_redirect', 'redirect_config', 'is_redirect_address_after_submission',
    'background_color', 'style', 'can_export_to_excel', 'case_sensitive', 'columns_key',
    'content_url', 'display_field_name', 'enable_fuzzy_query', 'enable_print_page',
    'enable_sort_by_column', 'fields_shown_setting', 'filter_conjunction', 'filters',
    'groupby_column_name', 'groupbys', 'groups_display_status', 'hidden_columns', 'hideEmptyValues',
    'is_hidden_toolbar', 'is_hidden_top_bar', 'is_note_show', 'is_query_result_editable',
    'link_columns_settings', 'note', 'pre_filter_conjunction', 'pre_filters', 'pre_sorts',
    'read_only_column_keys', 'row_height', 'showFieldNames', 'show_cell_coloring',
    'shown_column_keys', 'shown_image_column_key', 'shown_title_column_key', 'sort_column_key',
    'sort_type', 'sorts', 'title_column_name', 'wrapText',
    // [前端] 日历 / 时间线 / 表单旧版跳转
    'column_title', 'column_start_date', 'column_end_date', 'column_color', 'week_start', 'start_year_first_week',
    'colored_by_row_color', 'record_end_type', 'single_select_column_name', 'label_column_name',
    'start_time_column_name', 'end_time_column_name', 'record_duration_column_name', 'gridStartDate', 'gridEndDate',
    'redirect_address_url',
  ],
  staticElement: ['key', 'type', 'value', 'text_color', 'background_color'],
  formColumn: [
    'key', 'description', 'is_required', 'custom_name', 'require_fill_checked', 'filters',
    'filter_conjunction', 'editable', 'enable_fill_default_value', 'default_value',
    'enable_not_change_default_value', 'enable_scan_code_entry', 'options_show_type', 'permission',
    'query_list', 'shown', 'add_link_required_column_fields', 'add_link_visible_column_fields',
    'enable_add_new_records', 'enable_big_data', 'enable_customize_existing_link_btn_name',
    'enable_customize_new_link_btn_name', 'enable_link_existing_records', 'existing_link_btn_name',
    'link_at_most_one_record', 'link_existed_visible_column_fields', 'link_filter_conjunction',
    'link_filters', 'link_required_fields', 'link_visible_fields', 'new_link_btn_name',
  ],
};

// 表单列条目的完整默认值（与编辑器新建字段一致，见 exports/app_t_original.json）
export const FORM_COLUMN_DEFAULTS = {
  description: '', is_required: false, custom_name: '', require_fill_checked: false, filters: [],
  filter_conjunction: 'And', editable: true, enable_fill_default_value: false, default_value: '',
  enable_not_change_default_value: false, enable_scan_code_entry: false,
  options_show_type: 'dropdown', permission: 'rw', query_list: [],
};

export const FORM_PAGE_DEFAULTS = {
  icon: 'app-form', form_column_description_color: '#666666', success_message_option: null,
  add_duplicate_record_setting: { duplicate_prohibition: false, unique_column_keys: [] },
  static_elements: [], columns: [], elements_order: [],
  page_permissions: { view_rows_permission: { permission_type: 'default', permitted_roles: [] } },
  trigger_workflow_option: { can_trigger_workflow: false },
};

// [前端] 编辑器切换表格页的数据表时写入的字段；缺 shown_column_keys 页面会崩溃白屏
// shown_column_keys 默认全部列，由编译器按表格结构补
export const TABLE_PAGE_DEFAULTS = {
  sorts: [], filters: [], filter_conjunction: 'And', link_columns_settings: [],
  add_duplicate_record_setting: { duplicate_prohibition: false, unique_column_keys: [] },
};

export const ROOT_DEFAULTS = {
  app_type: 'universal-app', enable_load_base_comments: true, use_custom_icon: false,
  icon_class_name: 'default', app_icon: '', app_theme_mode: 'dark', app_theme_color: '#1D2838',
  version: 1, auto_archive_to_big_data: false, auto_archive_table_ids: [],
};
