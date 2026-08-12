// 高管驾驶舱 - 合规风险
import React, { useMemo } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Typography, Space, Divider, Badge } from 'antd'
import { BRAND_COLORS } from '../../theme.js'
import { RULES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Title, Text, Paragraph } = Typography

// 卡片统一样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12 }
const cardBodyStyle = { padding: 24 }

// 风险等级元数据
const RISK_META = {
  OK: { color: BRAND_COLORS.SUCCESS, label: '合规' },
  MID: { color: BRAND_COLORS.WARNING, label: '中风险' },
  HIGH: { color: BRAND_COLORS.ERROR, label: '高风险' }
}

// 「企业现状 vs 法律要求」对照（中/高风险项）
const LEGAL_COMPARE = {
  'R-001': {
    enterprise: '工作日加班不作数、不补休、不扣款，视为效率问题。',
    law: '安排延长工作时间的，支付不低于工资 150% 的报酬（劳动法§44(一)）。',
    suggestion: '工作日加班应按 150% 支付加班费，或经协商安排等量调休。'
  },
  'R-003': {
    enterprise: '法定节假日加班 1:1 转调休，不支付 300% 加班费。',
    law: '法定休假日安排工作的，支付不低于工资 300% 的报酬，不得以调休替代（劳动法§44(三)）。',
    suggestion: '立即修订规则 R-003：法定节假日加班一律按 300% 发放加班费，调休仅适用于休息日加班。'
  }
}

// 各规则整改建议
const SUGGESTIONS = {
  'R-001': '工作日加班按 150% 支付或安排调休',
  'R-002': '维持现状（休息日可调休，合规）',
  'R-003': '立即改为支付 300% 加班费，停止以调休替代',
  'R-004': '维持现状（旷工按 1 倍扣，合规）',
  'R-005': '维持现状',
  'R-006': '维持现状（病假扣 20%，符合陕西省工资支付条例）',
  'R-007': '维持现状（无病历按事假处理）',
  'R-008': '维持现状（企业自主）',
  'R-009': '维持现状（试用期 80%，符合劳动合同法§20）'
}

export default function Compliance() {
  const user = getCurrentUser()

  // 顶部统计：合规规则数 / 中风险数 / 高风险数
  const stats = useMemo(() => ({
    total: RULES.length,
    mid: RULES.filter(r => r.risk === 'MID').length,
    high: RULES.filter(r => r.risk === 'HIGH').length
  }), [])

  const columns = [
    { title: '编号', dataIndex: 'rCode', key: 'rCode', width: 90 },
    {
      title: '风险等级', dataIndex: 'risk', key: 'risk', width: 100,
      render: (risk) => {
        const m = RISK_META[risk]
        return (
          <Tag color={m.color} style={{ fontWeight: risk === 'HIGH' ? 700 : 400 }}>
            {m.label}
          </Tag>
        )
      }
    },
    { title: '规则名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100 },
    { title: '计算模式', dataIndex: 'mode', key: 'mode', width: 150 },
    { title: '描述', dataIndex: 'desc', key: 'desc' },
    { title: '来源', dataIndex: 'source', key: 'source', width: 180 },
    {
      title: '建议', key: 'suggestion', width: 220,
      render: (_, r) => SUGGESTIONS[r.rCode] || '—'
    }
  ]

  // 高风险项展开：「企业现状 vs 法律要求」对照
  const expandable = {
    expandedRowRender: (record) => {
      const cmp = LEGAL_COMPARE[record.rCode]
      if (!cmp) return <Text type="secondary">该规则暂无法律对照明细。</Text>
      return (
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Card
              size="small"
              title={<Text style={{ color: BRAND_COLORS.ERROR }}>企业现状</Text>}
              style={{ borderLeft: `4px solid ${BRAND_COLORS.ERROR}` }}
            >
              <Text>{cmp.enterprise}</Text>
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card
              size="small"
              title={<Text style={{ color: BRAND_COLORS.SUCCESS }}>法律要求</Text>}
              style={{ borderLeft: `4px solid ${BRAND_COLORS.SUCCESS}` }}
            >
              <Text>{cmp.law}</Text>
            </Card>
          </Col>
          <Col xs={24} md={4}>
            <Card size="small" title="整改建议">
              <Text type="warning">{cmp.suggestion}</Text>
            </Card>
          </Col>
        </Row>
      )
    },
    rowExpandable: (record) => record.risk === 'HIGH' || record.risk === 'MID'
  }

  // 重点突出：法定节假日加班（R-003 高风险）
  const focusRule = RULES.find(r => r.rCode === 'R-003')
  const focusCmp = LEGAL_COMPARE['R-003']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0, color: BRAND_COLORS.TEXT }}>合规风险</Title>
        <Text type="secondary">高管驾驶舱{user?.name ? ` · 欢迎，${user.name}` : ''}</Text>
      </div>

      {/* 顶部 3 个统计卡片 */}
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card style={{ ...cardStyle, borderTop: `3px solid ${BRAND_COLORS.PRIMARY}` }} bodyStyle={cardBodyStyle}>
            <Statistic
              title="合规规则数"
              value={stats.total}
              suffix="项"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.PRIMARY }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ ...cardStyle, borderTop: `3px solid ${BRAND_COLORS.WARNING}` }} bodyStyle={cardBodyStyle}>
            <Statistic
              title="中风险数"
              value={stats.mid}
              suffix="项"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.WARNING }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ ...cardStyle, borderTop: `3px solid ${BRAND_COLORS.ERROR}` }} bodyStyle={cardBodyStyle}>
            <Statistic
              title="高风险数"
              value={stats.high}
              suffix="项"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.ERROR }}
            />
          </Card>
        </Col>
      </Row>

      {/* 重点风险突出：法定节假日加班（R-003） */}
      {focusRule && focusCmp && (
        <Card
          title={
            <Space>
              <Badge color={BRAND_COLORS.ERROR} />
              <Text strong style={{ color: BRAND_COLORS.ERROR }}>
                重点风险 · {focusRule.name}（{focusRule.rCode}）
              </Text>
            </Space>
          }
          style={{ ...cardStyle, border: `1px solid ${BRAND_COLORS.ERROR}` }}
          bodyStyle={cardBodyStyle}
        >
          <Row gutter={16} align="top">
            <Col xs={24} md={8}>
              <div style={{ background: BRAND_COLORS.PRIMARY_LIGHT, borderRadius: 8, padding: 16, height: '100%' }}>
                <Text strong style={{ color: BRAND_COLORS.ERROR, display: 'block', marginBottom: 8 }}>企业现状</Text>
                <Text>{focusCmp.enterprise}</Text>
                <Divider style={{ margin: '12px 0' }} />
                <Text strong style={{ color: BRAND_COLORS.SUCCESS, display: 'block', marginBottom: 8 }}>法律要求</Text>
                <Text>{focusCmp.law}</Text>
              </div>
            </Col>
            <Col xs={24} md={16}>
              <Text strong style={{ display: 'block', marginBottom: 8, color: BRAND_COLORS.TEXT }}>差距分析</Text>
              <Paragraph type="secondary">
                企业现行规则将法定节假日加班 1:1 转为调休，未支付 300% 加班费，违反劳动法§44(三)。
                法定节假日加班报酬为强制性规定，<Text strong style={{ color: BRAND_COLORS.ERROR }}>不得以调休替代</Text>。
                一旦发生劳动仲裁，企业需补足差额并可能承担加付赔偿金风险。
              </Paragraph>
              <Card size="small" style={{ background: BRAND_COLORS.PRIMARY_LIGHT, border: 'none' }}>
                <Text strong style={{ color: BRAND_COLORS.WARNING }}>整改建议：</Text>
                <Text>{focusCmp.suggestion}</Text>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {/* 风险规则清单 */}
      <Card title="风险规则清单" style={cardStyle} bodyStyle={cardBodyStyle}>
        <Table
          rowKey="rCode"
          columns={columns}
          dataSource={RULES}
          expandable={expandable}
          pagination={false}
          size="middle"
          onRow={(r) => r.risk === 'HIGH'
            ? { style: { background: '#FFF5F4', borderLeft: `4px solid ${BRAND_COLORS.ERROR}` } }
            : {}}
        />
        <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
          提示：高风险行以红色边框/底色重点强调；点击中/高风险行前的展开图标可查看「企业现状 vs 法律要求」对照。
        </Text>
      </Card>
    </div>
  )
}
