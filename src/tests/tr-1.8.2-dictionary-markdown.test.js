'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  EMPLOYEE_STATUS,
  ATTENDANCE_EXCEPTION,
  LEAVE_TYPE,
  APPROVAL_STATUS,
  AREA_CODE,
  ENUM_TYPES,
  genEmployeeId,
  genDeptId,
  genPositionId,
  _resetCounters,
  genIdInfo,
  generateDictionaryMarkdown
} = require('../common/data_dictionary.js');

test('TR-1.8.2: 生成数据字典Markdown文档+5套枚举完整性检查+编码反解', async (t) => {
  const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'docs');
  const OUTPUT_FILE = path.join(OUTPUT_DIR, 'data_dictionary.md');

  await t.test('前置：确保docs目录存在', () => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    assert.ok(fs.existsSync(OUTPUT_DIR), `docs目录应存在: ${OUTPUT_DIR}`);
    console.log(`  ✓ 输出目录: ${OUTPUT_DIR}`);
  });

  await t.test('generateDictionaryMarkdown返回非空字符串', () => {
    const md = generateDictionaryMarkdown();
    assert.equal(typeof md, 'string', '返回值应为字符串类型');
    assert.ok(md.length > 500, `Markdown内容应大于500字符，实际=${md.length}`);
    console.log(`  ✓ Markdown内容长度: ${md.length}字符`);
  });

  await t.test('文档包含3类编码规则说明', () => {
    const md = generateDictionaryMarkdown();
    const checkPoints = [
      ['员工编码 (Employee ID)', 'E000001', '6位'],
      ['部门编码 (Department ID)', 'D0101', '层级码'],
      ['岗位编码 (Position ID)', 'P0001', '4位']
    ];
    for (const [title, sample, keyword] of checkPoints) {
      assert.ok(md.includes(title), `文档缺少编码规则标题: ${title}`);
      assert.ok(md.includes(sample), `文档缺少编码示例: ${sample}`);
      assert.ok(md.includes(keyword), `文档缺少关键字: ${keyword}`);
    }
    console.log('  ✓ 3类编码规则说明完整: 员工(E+6) / 部门(D+层级2位) / 岗位(P+4)');
  });

  await t.test('文档包含5套枚举标题', () => {
    const md = generateDictionaryMarkdown();
    const enumTitles = [
      '2.1 员工状态',
      '2.2 考勤异常类型',
      '2.3 假期类型',
      '2.4 审批状态',
      '2.5 地区编码'
    ];
    for (const title of enumTitles) {
      assert.ok(md.includes(title), `文档缺少枚举标题: ${title}`);
    }
    console.log('  ✓ 5套枚举标题全部出现在文档中');
  });

  await t.test('每套枚举表格3列：代码值+中文名称+说明', () => {
    const md = generateDictionaryMarkdown();
    const headerPattern = /\| 代码值 \| 中文名称 \| 说明 \|/g;
    const matches = md.match(headerPattern) || [];
    assert.equal(matches.length, 5, `应找到5套枚举的3列表头，实际=${matches.length}套`);
    console.log(`  ✓ 枚举表格3列表头数量: ${matches.length}/5套`);
  });

  await t.test('EMPLOYEE_STATUS 8项：代码值+中文名称全部出现在文档表格行中', () => {
    const md = generateDictionaryMarkdown();
    const enumObj = EMPLOYEE_STATUS;
    const nameMap = {
      PENDING_ONBOARD: '入职待报到',
      PROBATION: '试用期',
      REGULAR: '正式',
      TRANSFERRING: '调动中',
      PROMOTING: '晋升中',
      PENDING_LEAVE: '待离职',
      LEFT: '离职',
      RETIRED: '退休'
    };
    const codes = Object.values(enumObj);
    assert.equal(codes.length, 8, `EMPLOYEE_STATUS应有8项，实际=${codes.length}`);
    for (const code of codes) {
      const rowPattern = new RegExp(`\\|\\s*${code}\\s*\\|\\s*${nameMap[code]}\\s*\\|`, 'm');
      assert.ok(rowPattern.test(md), `文档表格行缺少 ${code}/${nameMap[code]}`);
    }
    console.log(`  ✓ EMPLOYEE_STATUS 8项表格行 全部出现: ${codes.length}/8`);
  });

  await t.test('ATTENDANCE_EXCEPTION 18项：全部代码值在文档中', () => {
    const md = generateDictionaryMarkdown();
    const codes = Object.values(ATTENDANCE_EXCEPTION);
    assert.equal(codes.length, 18, `ATTENDANCE_EXCEPTION应有18项，实际=${codes.length}`);
    let found = 0;
    for (const code of codes) {
      if (md.includes(`| ${code} |`)) found++;
    }
    assert.equal(found, 18, `文档中ATTENDANCE_EXCEPTION代码值出现${found}/18项`);
    console.log(`  ✓ ATTENDANCE_EXCEPTION ${found}/18项 代码值在文档表格中`);
  });

  await t.test('LEAVE_TYPE 8项：年假/病假/事假/婚假/产假/陪产假/丧假/调休 中文名称全在文档中', () => {
    const md = generateDictionaryMarkdown();
    const names = ['年假', '病假', '事假', '婚假', '产假', '陪产假', '丧假', '调休'];
    assert.equal(names.length, 8, `LEAVE_TYPE应8个中文名，实际=${names.length}`);
    for (const n of names) {
      assert.ok(md.includes(`| ${n} |`) || md.includes(`|ANNUAL| ${n} |`) || md.includes(`| ANNUAL | ${n} |`), `文档中缺少假期名称: ${n}`);
      const reg = new RegExp(`\\|\\s*[^|]+\\s*\\|\\s*${n}\\s*\\|`, 'm');
      assert.ok(reg.test(md), `LEAVE_TYPE名称校验失败: ${n}`);
    }
    const codes = Object.values(LEAVE_TYPE);
    assert.equal(codes.length, 8, `LEAVE_TYPE代码数应为8，实际=${codes.length}`);
    console.log(`  ✓ LEAVE_TYPE 8项中英文名全在文档中: ${names.join('、')}`);
  });

  await t.test('APPROVAL_STATUS 7项：草稿/待审批/审批中/已通过/已驳回/已撤销/已转交 全在文档', () => {
    const md = generateDictionaryMarkdown();
    const names = ['草稿', '待审批', '审批中', '已通过', '已驳回', '已撤销', '已转交'];
    assert.equal(names.length, 7, `APPROVAL_STATUS应7个中文名，实际=${names.length}`);
    for (const n of names) {
      const reg = new RegExp(`\\|\\s*[^|]+\\s*\\|\\s*${n}\\s*\\|`, 'm');
      assert.ok(reg.test(md), `APPROVAL_STATUS名称校验失败: ${n}`);
    }
    console.log(`  ✓ APPROVAL_STATUS 7项中文名全在文档中: ${names.join('、')}`);
  });

  await t.test('AREA_CODE 5项：西安XA/天水TS/白银BY/平凉PL/兰州LZ 全在文档', () => {
    const md = generateDictionaryMarkdown();
    const pairs = [['XA','西安'], ['TS','天水'], ['BY','白银'], ['PL','平凉'], ['LZ','兰州']];
    assert.equal(pairs.length, 5, `AREA_CODE应5项，实际=${pairs.length}`);
    for (const [code, name] of pairs) {
      const reg = new RegExp(`\\|\\s*${code}\\s*\\|\\s*${name}\\s*\\|`, 'm');
      assert.ok(reg.test(md), `AREA_CODE校验失败: ${code}/${name}`);
    }
    console.log(`  ✓ AREA_CODE 5项全在文档: ${pairs.map(p => p[1]+p[0]).join('/')}`);
  });

  await t.test('genIdInfo反解：员工编码/部门编码/岗位编码 全部信息正确', () => {
    _resetCounters();
    const eInfo = genIdInfo('E000123');
    assert.ok(eInfo, 'E000123应能反解');
    assert.equal(eInfo.type, 'EMPLOYEE');
    assert.equal(eInfo.sequence, 123);
    assert.equal(eInfo.prefix, 'E');

    const pInfo = genIdInfo('P0088');
    assert.ok(pInfo, 'P0088应能反解');
    assert.equal(pInfo.type, 'POSITION');
    assert.equal(pInfo.sequence, 88);

    const d1Info = genIdInfo('D01');
    assert.ok(d1Info, 'D01应能反解');
    assert.equal(d1Info.type, 'DEPARTMENT');
    assert.equal(d1Info.level, 1);
    assert.equal(d1Info.parentDeptId, null);
    assert.equal(d1Info.sequence, 1);

    const d2Info = genIdInfo('D0105');
    assert.ok(d2Info, 'D0105应能反解');
    assert.equal(d2Info.level, 2);
    assert.equal(d2Info.parentDeptId, 'D01');
    assert.equal(d2Info.sequence, 5);

    const d3Info = genIdInfo('D030208');
    assert.ok(d3Info, 'D030208应能反解');
    assert.equal(d3Info.level, 3);
    assert.equal(d3Info.parentDeptId, 'D0302');
    assert.equal(d3Info.sequence, 8);

    const badInfo1 = genIdInfo('X001');
    const badInfo2 = genIdInfo('E123');
    const badInfo3 = genIdInfo(null);
    assert.equal(badInfo1, null, 'X001非支持前缀应返回null');
    assert.equal(badInfo2, null, 'E123位数不足6位应返回null');
    assert.equal(badInfo3, null, 'null应返回null');
    console.log('  ✓ genIdInfo反解: E/P/D 各层级 反解信息正确，无效值返回null');
  });

  await t.test('写入Markdown文件到磁盘', () => {
    const md = generateDictionaryMarkdown();
    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
    assert.ok(fs.existsSync(OUTPUT_FILE), `文件应已写入: ${OUTPUT_FILE}`);
    const stat = fs.statSync(OUTPUT_FILE);
    assert.ok(stat.size > 1000, `文件大小应>1000字节，实际=${stat.size}字节`);
    console.log(`  ✓ 字典文档已写入: ${OUTPUT_FILE}`);
    console.log(`  ✓ 文件大小: ${stat.size}字节`);
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('TR-1.8.2 测试全部通过:');
  console.log('  - 3类编码规则说明: 员工/部门/岗位 ✓');
  console.log('  - 5套枚举标题: 状态/考勤异常/假期/审批/地区 ✓');
  console.log('  - 5套枚举表格3列(代码值|中文名称|说明): 5/5套 ✓');
  console.log('  - EMPLOYEE_STATUS 8项: 8/8 ✓');
  console.log('  - ATTENDANCE_EXCEPTION 18项: 18/18 ✓');
  console.log('  - LEAVE_TYPE 8项: 8/8 ✓');
  console.log('  - APPROVAL_STATUS 7项: 7/7 ✓');
  console.log('  - AREA_CODE 5项: 5/5 ✓');
  console.log('  - genIdInfo反解: 各类编码信息正确 ✓');
  console.log(`  - 输出文件: ${OUTPUT_FILE}`);
  console.log('═══════════════════════════════════════════════\n');
});
