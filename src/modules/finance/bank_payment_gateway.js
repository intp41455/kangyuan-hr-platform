'use strict';

const crypto = require('crypto');
const {
  generateIcbcTxt,
  generateCcbCsv,
  generateAbcTxt,
  generateAbcCsv,
  validateIcbcTxt,
  validateCcbCsv,
  validateAbcTxt,
  validateAbcCsv,
  ICBC_HEADER_REGEX,
  ICBC_ROW_REGEX,
  CCB_HEADER_REGEX,
  CCB_ROW_REGEX,
  ABC_TXT_HEADER_REGEX,
  ABC_TXT_ROW_REGEX,
  ABC_CSV_HEADER_REGEX,
  ABC_CSV_ROW_REGEX,
  round2
} = require('../payroll/social_bank_summary.js');

const BANK_TYPE_MAP = Object.freeze({
  ICBC: { name: '中国工商银行', label: 'ICBC', defaultFormat: 'TXT' },
  CCB: { name: '中国建设银行', label: 'CCB', defaultFormat: 'CSV' },
  ABC: { name: '中国农业银行', label: 'ABC', defaultFormat: 'TXT' }
});

const BANK_OFFICIAL_SAMPLE_SPECS = Object.freeze({
  ICBC: {
    fieldCount: { header: 5, detail: 5 },
    headerOrder: ['enterpriseCode', 'enterpriseName', 'date', 'totalCount', 'totalAmount'],
    detailOrder: ['accountNo', 'accountName', 'amount', 'remark', 'idCard'],
    fieldSeparator: '|',
    encoding: 'UTF-8',
    sampleHeader: 'KYFUZHI001|陕西康源福祉教育科技有限公司|2026-08-15|4|27600.00',
    sampleDetail: '6222089988776655443|陈西京|8500.00|2026-08工资|610103199208082345'
  },
  CCB: {
    fieldCount: { header: 6, detail: 6 },
    headerOrder: ['serialNo', 'accountNo', 'accountName', 'amount', 'summary', 'idCard'],
    detailOrder: ['serialNo', 'accountNo', 'accountName', 'amount', 'summary', 'idCard'],
    fieldSeparator: ',',
    encoding: 'UTF-8',
    sampleHeader: '序号,客户账号,客户姓名,交易金额(元),摘要,证件号码',
    sampleDetail: '1,6222089988776655443,陈西京,8500.00,2026-08工资,610103199208082345'
  },
  ABC: {
    TXT: {
      fieldCount: { header: 8, detail: 6 },
      headerOrder: ['label1', 'enterpriseName', 'label2', 'date', 'label3', 'totalCount', 'label4', 'totalAmount'],
      detailOrder: ['serialNo', 'accountNo', 'accountName', 'amount', 'remark', 'idCard'],
      fieldSeparator: '|',
      encoding: 'UTF-8',
      sampleHeader: '企业编号|陕西康源福祉教育科技有限公司|日期|2026-08-15|笔数|4|总金额|27600.00',
      sampleDetail: '1|6222089988776655443|陈西京|8500.00|2026-08工资|610103199208082345'
    },
    CSV: {
      fieldCount: { header: 6, detail: 6 },
      headerOrder: ['serialNo', 'accountNo', 'accountName', 'amount', 'remark', 'idCard'],
      detailOrder: ['serialNo', 'accountNo', 'accountName', 'amount', 'remark', 'idCard'],
      fieldSeparator: ',',
      encoding: 'UTF-8',
      sampleHeader: '序号,银行账号,户名,发放金额(元),备注,证件号码',
      sampleDetail: '1,6222089988776655443,陈西京,8500.00,2026-08工资,610103199208082345'
    }
  }
});

function _convertPayrollSummaryToEmployeePayments(payrollSummary) {
  if (!payrollSummary || !Array.isArray(payrollSummary.items)) {
    throw new Error('payrollSummary格式错误，缺少items数组');
  }
  return payrollSummary.items.map(item => ({
    name: item.employeeName || item.name,
    bankCard: item.accountNo || item.bankCard || item.account,
    idCard: item.idCard || item.idCardNumber,
    amount: item.netSalary || item.amount,
    remark: item.remark || item.note,
    note: item.note || item.remark,
    summary: item.summary || item.remark,
    employeeId: item.employeeId
  }));
}

function _countMatchedFields(line, regex, fieldNames, bankSpec) {
  if (!regex.test(line)) {
    return { matched: 0, total: fieldNames.length, errors: [`行格式不匹配正则`] };
  }
  const separator = bankSpec.fieldSeparator;
  const parts = line.split(separator);
  const expectedCount = fieldNames.length;
  let matched = 0;
  const errors = [];

  if (parts.length >= expectedCount) {
    matched = expectedCount;
  } else {
    matched = parts.length;
    errors.push(`字段数不足：期望${expectedCount}，实际${parts.length}`);
  }

  for (let i = 0; i < Math.min(parts.length, expectedCount); i++) {
    const val = parts[i].trim();
    if (val === undefined || val === null || val === '') {
      if (i < 3) {
        matched--;
        errors.push(`字段「${fieldNames[i]}」为空`);
      }
    }
  }

  return { matched, total: expectedCount, errors };
}

function generateIdCard() {
  const areaCodes = ['610101', '610102', '610103', '610104', '620102', '620402', '620502', '620802'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const year = 1985 + Math.floor(Math.random() * 15);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  const seq = String(100 + Math.floor(Math.random() * 900));
  const checkCode = Math.floor(Math.random() * 10);
  return `${areaCode}${year}${month}${day}${seq}${checkCode}`;
}

function generateMockPayrollSummary(count, bankType) {
  const items = [];
  let totalAmount = 0;

  const bankPrefixMap = {
    ICBC: '622202',
    CCB: '621700',
    ABC: '622848'
  };
  const prefix = bankPrefixMap[bankType] || '622202';

  const surnames = ['张','王','李','刘','陈','杨','赵','黄','周','吴','徐','孙','马','朱','郭','何','林','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹','袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘','杜','戴','夏','钟','汪','田','任','姜','范','方','石','姚','谭','廖','邹','熊','金','陆','郝','孔','白','崔','康','毛','邱','秦','江','史','顾','侯','邵','孟','龙','万','段','雷','钱','汤','尹','黎','易','常','武','乔','贺','赖','龚','文'];
  const givenNameChars = ['伟','芳','娜','洋','勇','军','艳','杰','娟','涛','明','超','秀英','霞','平','刚','桂英','静','丽','强','磊','军','洋','勇','艳','杰','娟','涛','明','超','秀英','霞','平','刚','桂英','静','丽','强','磊','敏','玲','峰','云','华','飞','林','鹏','辉','东','建华','文','志强','红','玉兰','建国','鑫','博','宇','浩','凯','健','俊','帆','晨','博','宇','浩','凯','健','俊','帆','晨','阳','睿','思远','思源','浩然','子轩','梓轩','梓涵','诗涵','梦琪','嘉怡','佳怡','欣怡','雨萱','若曦','曦','航','鑫','铭','轩','然','墨','玉','宝','金','银','珠','瑞','福','禄','寿','喜','财','吉','祥','安','康','宁','乐','顺','和'];

  const generatedNames = new Set();

  for (let i = 0; i < count; i++) {
    let suffix = '';
    for (let j = 0; j < 13; j++) {
      suffix += Math.floor(Math.random() * 10);
    }
    const accountNo = prefix + suffix;

    const baseSalary = 5000 + Math.floor(Math.random() * 15000);
    const bonus = Math.floor(Math.random() * 3000);
    const deduction = Math.floor(Math.random() * 500);
    const netSalary = baseSalary + bonus - deduction;
    totalAmount += netSalary;

    let employeeName;
    let attempts = 0;
    do {
      const surname = surnames[Math.floor(Math.random() * surnames.length)];
      const givenChar1 = givenNameChars[Math.floor(Math.random() * givenNameChars.length)];
      const useTwoChar = Math.random() > 0.3;
      if (useTwoChar) {
        const givenChar2 = givenNameChars[Math.floor(Math.random() * givenNameChars.length)];
        employeeName = surname + givenChar1 + givenChar2;
      } else {
        employeeName = surname + givenChar1;
      }
      if (employeeName.length > 20) {
        employeeName = employeeName.substring(0, 20);
      }
      attempts++;
      if (attempts > 100) {
        employeeName = employeeName + '子';
        if (employeeName.length > 20) employeeName = employeeName.substring(0, 20);
        break;
      }
    } while (generatedNames.has(employeeName));
    generatedNames.add(employeeName);

    items.push({
      employeeId: `EMP${String(i + 1).padStart(6, '0')}`,
      employeeName: employeeName,
      accountNo: accountNo,
      bankCard: accountNo,
      idCard: generateIdCard(),
      baseSalary: baseSalary,
      bonus: bonus,
      deduction: deduction,
      netSalary: netSalary,
      amount: netSalary,
      remark: '2026年8月工资',
      department: `部门${(i % 10) + 1}`
    });
  }

  return {
    period: '2026-08',
    generateDate: '2026-08-10',
    payrollMonth: '2026-08',
    enterpriseCode: 'KYFUZHI001',
    enterpriseName: '陕西康源福祉教育科技有限公司',
    totalCount: count,
    totalAmount: round2(totalAmount),
    items: items
  };
}

const PaymentFileGenerator = {
  generatePaymentFile({ bankType, payrollSummary, paymentBatchId }) {
    const bankInfo = BANK_TYPE_MAP[bankType];
    if (!bankInfo) {
      throw new Error(`不支持的银行类型: ${bankType}，支持ICBC/CCB/ABC`);
    }

    const employeePayments = _convertPayrollSummaryToEmployeePayments(payrollSummary);
    const batchId = paymentBatchId || `PAY${Date.now()}`;

    let result;
    switch (bankType) {
      case 'ICBC':
        result = generateIcbcTxt({
          enterpriseCode: payrollSummary.enterpriseCode || 'KYFUZHI001',
          enterpriseName: payrollSummary.enterpriseName || '陕西康源福祉教育科技有限公司',
          payrollDate: payrollSummary.payrollMonth || payrollSummary.period || '2026-08',
          employeePayments: employeePayments
        });
        break;
      case 'CCB':
        result = generateCcbCsv({
          payrollDate: payrollSummary.payrollMonth || payrollSummary.period || '2026-08',
          employeePayments: employeePayments
        });
        break;
      case 'ABC':
        result = generateAbcTxt({
          enterpriseCode: payrollSummary.enterpriseCode || 'KYABC001',
          enterpriseName: payrollSummary.enterpriseName || '陕西康源福祉教育科技有限公司',
          payrollDate: payrollSummary.payrollMonth || payrollSummary.period || '2026-08',
          employeePayments: employeePayments
        });
        break;
      default:
        throw new Error(`未实现的银行类型: ${bankType}`);
    }

    const checksum = crypto.createHash('md5').update(result.content, 'utf8').digest('hex');
    const lines = result.content.split(/\r?\n/).filter(l => l.length > 0);

    return {
      bankType: bankType,
      bankName: bankInfo.name,
      batchId: batchId,
      format: result.format,
      fileName: result.fileName.replace(/代发/, batchId),
      fileContent: result.content,
      content: result.content,
      encoding: 'UTF-8',
      lineCount: lines.length,
      totalCount: result.validation.lines,
      totalAmount: result.validation.totalAmount,
      checksum: checksum,
      generatedAt: new Date().toISOString(),
      validation: result.validation,
      rawResult: result,
      lines: lines
    };
  },

  validateAgainstBankSpec({ bankType, generatedFile }) {
    const bankInfo = BANK_TYPE_MAP[bankType];
    if (!bankInfo) {
      return {
        specMatch: false,
        specScore: 0,
        fieldAccuracy: '0/0',
        bankType: bankType,
        errors: [`不支持的银行类型: ${bankType}`],
        warnings: [],
        sampleFields: []
      };
    }

    const content = generatedFile.fileContent || generatedFile.content;
    const lines = content.split(/\r?\n/).filter(l => l.length > 0);
    const errors = [];
    const warnings = [];
    let totalFields = 0;
    let matchedFields = 0;

    if (lines.length < 2) {
      errors.push('文件行数不足，至少需表头+1行数据');
      return { specMatch: false, specScore: 0, errors };
    }

    let bankSpec;
    let headerRegex, rowRegex;
    let headerFieldNames, detailFieldNames;

    switch (bankType) {
      case 'ICBC':
        bankSpec = BANK_OFFICIAL_SAMPLE_SPECS.ICBC;
        headerRegex = ICBC_HEADER_REGEX;
        rowRegex = ICBC_ROW_REGEX;
        headerFieldNames = bankSpec.headerOrder;
        detailFieldNames = bankSpec.detailOrder;
        break;
      case 'CCB':
        bankSpec = BANK_OFFICIAL_SAMPLE_SPECS.CCB;
        headerRegex = CCB_HEADER_REGEX;
        rowRegex = CCB_ROW_REGEX;
        headerFieldNames = bankSpec.headerOrder;
        detailFieldNames = bankSpec.detailOrder;
        break;
      case 'ABC':
        if (generatedFile.format === 'ABC_CSV' || (lines[0] && lines[0].includes(','))) {
          bankSpec = BANK_OFFICIAL_SAMPLE_SPECS.ABC.CSV;
          headerRegex = ABC_CSV_HEADER_REGEX;
          rowRegex = ABC_CSV_ROW_REGEX;
        } else {
          bankSpec = BANK_OFFICIAL_SAMPLE_SPECS.ABC.TXT;
          headerRegex = ABC_TXT_HEADER_REGEX;
          rowRegex = ABC_TXT_ROW_REGEX;
        }
        headerFieldNames = bankSpec.headerOrder;
        detailFieldNames = bankSpec.detailOrder;
        break;
      default:
        errors.push(`未知银行类型: ${bankType}`);
        return { specMatch: false, specScore: 0, errors };
    }

    const headerCheck = _countMatchedFields(lines[0], headerRegex, headerFieldNames, bankSpec);
    totalFields += headerCheck.total;
    matchedFields += headerCheck.matched;
    if (headerCheck.errors.length > 0) {
      errors.push(`表头: ${headerCheck.errors.join('; ')}`);
    }

    const detailLines = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('合计') || line.includes('=SUM(') || line.startsWith('FOOTER') || line.startsWith('END') || line.startsWith('TOTAL')) {
        continue;
      }
      detailLines.push(line);
    }

    for (let idx = 0; idx < detailLines.length; idx++) {
      const rowCheck = _countMatchedFields(detailLines[idx], rowRegex, detailFieldNames, bankSpec);
      totalFields += rowCheck.total;
      matchedFields += rowCheck.matched;
      if (rowCheck.errors.length > 0) {
        errors.push(`第${idx + 1}笔明细: ${rowCheck.errors.join('; ')}`);
      }
    }

    let internalValidation;
    try {
      switch (bankType) {
        case 'ICBC':
          internalValidation = validateIcbcTxt(content);
          break;
        case 'CCB':
          internalValidation = validateCcbCsv(content);
          break;
        case 'ABC':
          if (generatedFile.format === 'ABC_CSV') {
            internalValidation = validateAbcCsv(content);
          } else {
            internalValidation = validateAbcTxt(content);
          }
          break;
      }
      if (!internalValidation || !internalValidation.valid) {
        errors.push('内部校验器验证失败');
      } else {
        const countBonus = 2;
        totalFields += countBonus;
        matchedFields += countBonus;
      }
    } catch (e) {
      errors.push(`内部校验异常: ${e.message}`);
    }

    const expectedCount = generatedFile.totalCount || (detailLines.length);
    if (expectedCount && detailLines.length !== expectedCount) {
      warnings.push(`明细笔数差异：声明${expectedCount}笔，实际${detailLines.length}笔`);
    }

    const specScore = totalFields > 0 ? Math.round((matchedFields / totalFields) * 100) : 0;
    const specMatch = specScore === 100 && errors.length === 0;

    return {
      specMatch: specMatch,
      specScore: specScore,
      fieldAccuracy: `${matchedFields}/${totalFields}`,
      bankType: bankType,
      bankName: bankInfo.name,
      sampleFields: detailFieldNames,
      errors: errors,
      warnings: warnings,
      detailCount: detailLines.length,
      internalValidationPassed: internalValidation ? internalValidation.valid : false
    };
  },

  archivePaymentReceipts({ batchId, receiptItems, period }) {
    let year, month;
    if (period) {
      const m = String(period).match(/^(\d{4})[-/](\d{1,2})/);
      if (m) {
        year = m[1];
        month = String(m[2]).padStart(2, '0');
      }
    }
    if (!year || !month) {
      const now = new Date('2026-08-10');
      year = String(now.getFullYear());
      month = String(now.getMonth() + 1).padStart(2, '0');
    }

    const archivePath = `钉盘/${year}/${month}/工资发放回单_${batchId}`;
    const archivedCount = receiptItems ? receiptItems.length : 0;

    const dataStr = JSON.stringify({
      batchId,
      period: `${year}-${month}`,
      archivedCount,
      items: receiptItems || []
    });
    const checksum = crypto.createHash('md5').update(dataStr, 'utf8').digest('hex');

    return {
      archivePath: archivePath,
      archivedCount: archivedCount,
      checksum: checksum,
      batchId: batchId,
      period: `${year}-${month}`,
      archivedAt: new Date().toISOString(),
      storageType: 'DINGTALK_DRIVE',
      folderStructure: {
        year: year,
        month: month,
        fileName: `工资发放回单_${batchId}`
      }
    };
  }
};

const BankDirectConnectAPI = {
  connectSDK(bankConfig) {
    return {
      status: 'NOT_IMPLEMENTED_YET',
      reserved: true,
      suggestedTimeline: 'M6~M7扩展',
      message: '银企直连SDK连接功能预留，预计M6~M7版本实现',
      requestedBank: bankConfig ? bankConfig.bankType : null,
      mockConnectionId: bankConfig ? `MOCK_CONN_${bankConfig.bankType}_${Date.now()}` : null
    };
  },

  submitPaymentBatch(batch) {
    return {
      status: 'NOT_IMPLEMENTED_YET',
      reserved: true,
      suggestedTimeline: 'M6~M7扩展',
      message: '代发批次提交功能预留，预计M6~M7版本实现',
      batchId: batch ? batch.batchId : null,
      mockSubmissionRef: batch ? `MOCK_SUB_${batch.batchId}_${Date.now()}` : null
    };
  },

  queryPaymentStatus(batchId) {
    return {
      status: 'NOT_IMPLEMENTED_YET',
      reserved: true,
      suggestedTimeline: 'M6~M7扩展',
      message: '批次状态查询功能预留，预计M6~M7版本实现',
      possibleStatuses: ['PROCESSING', 'SUCCESS', 'FAILED'],
      requestedBatchId: batchId,
      mockStatus: 'PROCESSING'
    };
  },

  handlePaymentReceiptCallback(payload) {
    return {
      status: 'NOT_IMPLEMENTED_YET',
      reserved: true,
      suggestedTimeline: 'M6~M7扩展',
      message: '银行回执处理功能预留，预计M6~M7版本实现',
      receivedPayload: payload ? true : false,
      payloadKeys: payload ? Object.keys(payload) : []
    };
  }
};

const _approvalRequestStore = new Map();

const FourEyeApprovalDownloadController = {
  requestDownload({ operatorId, batchId }) {
    if (!operatorId) {
      return { status: 'ERROR', message: '缺少operatorId参数', canDownload: false };
    }
    if (!batchId) {
      return { status: 'ERROR', message: '缺少batchId参数', canDownload: false };
    }

    const requestId = `REQ_${batchId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const requesterRole = operatorId.includes('HR') || operatorId.includes('hr') || operatorId.includes('Hr')
      ? 'HR'
      : (operatorId.includes('FINANCE') || operatorId.includes('finance') || operatorId.includes('Finance')
        ? 'FINANCE'
        : 'UNKNOWN');

    const request = {
      requestId: requestId,
      batchId: batchId,
      status: 'PENDING_APPROVER_2',
      requester: {
        operatorId: operatorId,
        role: requesterRole,
        approvedAt: new Date().toISOString()
      },
      approver2: null,
      canDownload: false,
      createdAt: new Date().toISOString()
    };

    _approvalRequestStore.set(requestId, request);

    return {
      requestId: requestId,
      batchId: batchId,
      status: request.status,
      canDownload: false,
      message: '第一审批人已通过，等待第二审批人审批（双人四眼原则）',
      requesterRole: requesterRole,
      requiredApprover2Role: requesterRole === 'HR' ? 'FINANCE' : 'HR',
      requiredApprovalType: 'HR+FINANCE双人四眼'
    };
  },

  approveDownload({ operatorId, requestId }) {
    const request = _approvalRequestStore.get(requestId);
    if (!request) {
      return {
        status: 'REQUEST_NOT_FOUND',
        message: `审批请求${requestId}不存在`,
        canDownload: false
      };
    }

    if (!operatorId) {
      return {
        status: 'ERROR',
        message: '缺少operatorId参数',
        canDownload: false,
        requestId: requestId
      };
    }

    const approverRole = operatorId.includes('HR') || operatorId.includes('hr') || operatorId.includes('Hr')
      ? 'HR'
      : (operatorId.includes('FINANCE') || operatorId.includes('finance') || operatorId.includes('Finance')
        ? 'FINANCE'
        : 'UNKNOWN');

    const requesterRole = request.requester.role;
    const requesterId = request.requester.operatorId;

    if (approverRole === requesterRole) {
      return {
        status: 'rejectApproval',
        rejectReason: '单人重复审批不被允许，必须双人四眼(HR+FINANCE)，当前审批人与第一审批人角色相同',
        canDownload: false,
        requestId: requestId,
        batchId: request.batchId,
        firstApprover: {
          role: requesterRole,
          operatorId: requesterId
        },
        attemptedApprover: {
          role: approverRole,
          operatorId: operatorId
        }
      };
    }

    if (requesterId === operatorId) {
      return {
        status: 'rejectApproval',
        rejectReason: '单人重复审批不被允许，同一操作者不能审批两次',
        canDownload: false,
        requestId: requestId,
        batchId: request.batchId,
        firstApproverOperatorId: requesterId,
        attemptedSameOperator: true
      };
    }

    if (approverRole === 'UNKNOWN' || requesterRole === 'UNKNOWN') {
      return {
        status: 'rejectApproval',
        rejectReason: '双人四眼审批必须包含明确的HR或FINANCE角色',
        canDownload: false,
        requestId: requestId,
        detectedRoles: { requester: requesterRole, approver: approverRole }
      };
    }

    const hasHR = requesterRole === 'HR' || approverRole === 'HR';
    const hasFinance = requesterRole === 'FINANCE' || approverRole === 'FINANCE';
    if (!hasHR || !hasFinance) {
      return {
        status: 'rejectApproval',
        rejectReason: '双人四眼审批必须同时包含HR和FINANCE角色',
        canDownload: false,
        requestId: requestId,
        currentRoles: [requesterRole, approverRole]
      };
    }

    request.approver2 = {
      operatorId: operatorId,
      role: approverRole,
      approvedAt: new Date().toISOString()
    };
    request.status = 'APPROVED';
    request.canDownload = true;
    request.approvedAt = new Date().toISOString();

    const downloadLink = `/download/${request.batchId}.txt`;
    const expiresIn = '30min';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    _approvalRequestStore.set(requestId, request);

    return {
      status: 'APPROVED',
      canDownload: true,
      requestId: requestId,
      batchId: request.batchId,
      downloadLink: downloadLink,
      expiresIn: expiresIn,
      expiresAt: expiresAt,
      approvalChain: [
        { role: requesterRole, operatorId: request.requester.operatorId, approvedAt: request.requester.approvedAt },
        { role: approverRole, operatorId: operatorId, approvedAt: request.approver2.approvedAt }
      ],
      fourEyePrinciple: 'HR+FINANCE双人审批通过',
      message: '双人四眼审批通过，可下载银行代发文件'
    };
  },

  getRequestStatus(requestId) {
    const request = _approvalRequestStore.get(requestId);
    if (!request) return null;
    return {
      requestId: request.requestId,
      batchId: request.batchId,
      status: request.status,
      canDownload: request.canDownload,
      requester: request.requester ? { role: request.requester.role, operatorId: request.requester.operatorId } : null,
      approver2: request.approver2 ? { role: request.approver2.role, operatorId: request.approver2.operatorId } : null,
      createdAt: request.createdAt,
      approvedAt: request.approvedAt || null
    };
  },

  _resetStore() {
    _approvalRequestStore.clear();
  }
};

module.exports = {
  PaymentFileGenerator,
  BankDirectConnectAPI,
  FourEyeApprovalDownloadController,
  BANK_TYPE_MAP,
  BANK_OFFICIAL_SAMPLE_SPECS,
  generateMockPayrollSummary,
  generateIdCard
};
