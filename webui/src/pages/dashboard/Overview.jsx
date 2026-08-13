// 高管驾驶舱 - 集团总览
import React, { useMemo } from 'react'
import { Row, Col, Card, Statistic, Progress, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { BRAND_COLORS } from '../../theme.js'
import { KPIS, BU_BREAKDOWN, MONTHLY_COST_TREND, RULES } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const { Title, Text } = Typography

const cardStyle = { borderRadius: 12 }
const cardBodyStyle = { padding: 24 }

export default function Overview() {
  const user = getCurrentUser()

  const trendOption = useMemo(() => ({
    color: [BRAND_COLORS.BU_MEIHONG, BRAND_COLORS.BU_FUZHI_EDU, BRAND_COLORS.BU_QIXIANG],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: v => `¥${(v / 10000).toFixed(1)} 万`
    },
    legend: { data: ['康源美宏', '福祉教育', '耆祥'], top: 0, textStyle: { color: BRAND_COLORS.TEXT_MUTED } },
    grid: { left: 56, right: 24, top: 40, bottom: 32 },
    xAxis: {
      type: 'category',
      data: MONTHLY_COST_TREND.months,
      axisLine: { lineStyle: { color: BRAND_COLORS.BORDER } },
      axisLabel: { color: BRAND_COLORS.TEXT_MUTED }
    },
    yAxis: {
      type: 'value',
      name: '金额(元)',
      nameTextStyle: { color: BRAND_COLORS.TEXT_MUTED },
      axisLabel: { color: BRAND_COLORS.TEXT_MUTED, formatter: v => `${(v / 10000).toFixed(0)}万` },
      splitLine: { lineStyle: { color: BRAND_COLORS.BORDER } }
    },
    series: [
      { name: '康源美宏', type: 'bar', stack: 'total', data: MONTHLY_COST_TREND.meihong },
      { name: '福祉教育', type: 'bar', stack: 'total', data: MONTHLY_COST_TREND.fuzhi },
      {
        name: '耆祥', type: 'bar', stack: 'total',
        data: MONTHLY_COST_TREND.qixiang,
        itemStyle: { borderRadius: [4, 4, 0, 0] }
      }
    ]
  }), [])

  const pieOption = useMemo(() => ({
    color: [BRAND_COLORS.BU_MEIHONG, BRAND_COLORS.BU_FUZHI_EDU, BRAND_COLORS.BU_QIXIANG],
    tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: BRAND_COLORS.TEXT_MUTED } },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{d}%', color: BRAND_COLORS.TEXT },
      data: BU_BREAKDOWN.map(b => ({ name: b.name, value: b.employees }))
    }]
  }), [])

  const okCount = RULES.filter(r => r.risk === 'OK').length
  const complianceRate = +(okCount / RULES.length * 100).toFixed(2)

  const healthMetrics = [
    { name: '核算准确率', display: `${KPIS.payrollAccuracy.toFixed(2)}%`, goodness: KPIS.payrollAccuracy },
    { name: '自助确认率', display: `${KPIS.selfConfirmRate.toFixed(1)}%`, goodness: KPIS.selfConfirmRate },
    { name: '回放误差', display: `${KPIS.historyReplayError.toFixed(2)}%`, goodness: 100 - KPIS.historyReplayError, lowerBetter: true },
    { name: '故障恢复率', display: `${KPIS.failureRecoveryRate}%`, goodness: KPIS.failureRecoveryRate },
    { name: '人时降幅', display: `${KPIS.timeReduction.toFixed(3)}%`, goodness: KPIS.timeReduction },
    { name: '规则合规率', display: `${complianceRate}%`, goodness: complianceRate }
  ]

  const healthColor = (g) => g >= 95 ? BRAND_COLORS.SUCCESS : (g >= 80 ? BRAND_COLORS.WARNING : BRAND_COLORS.ERROR)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0, color: BRAND_COLORS.TEXT }}>集团总览</Title>
        <Text type="secondary">高管驾驶舱{user?.name ? ` · 欢迎，${user.name}` : ''}</Text>
      </div>

      <Row gutter={16}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic
              title="总员工数"
              value={KPIS.totalEmployees}
              suffix="人"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.PRIMARY }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic
              title="月度薪酬总成本"
              value={KPIS.monthlyPayrollCost / 10000}
              precision={1}
              prefix="¥"
              suffix="万元"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.PRIMARY }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic
              title="核算准确率"
              value={KPIS.payrollAccuracy}
              precision={2}
              suffix="%"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.SUCCESS }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={cardBodyStyle}>
            <Statistic
              title="自助确认率"
              value={KPIS.selfConfirmRate}
              precision={1}
              suffix="%"
              valueStyle={{ fontSize: 30, fontWeight: 700, color: BRAND_COLORS.SUCCESS }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="月度人力成本趋势" style={cardStyle} bodyStyle={cardBodyStyle}>
            <ReactECharts echarts={echarts} option={trendOption} style={{ height: 320 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="三板块员工规模占比" style={cardStyle} bodyStyle={cardBodyStyle}>
            <ReactECharts echarts={echarts} option={pieOption} style={{ height: 320 }} />
          </Card>
        </Col>
      </Row>

      <Card title="关键指标健康度" style={cardStyle} bodyStyle={cardBodyStyle}>
        <Row gutter={[16, 24]}>
          {healthMetrics.map(m => (
            <Col xs={24} sm={12} lg={8} xl={4} key={m.name} style={{ textAlign: 'center' }}>
              <Progress
                type="dashboard"
                gapDegree={180}
                gapPosition="bottom"
                percent={Math.round(m.goodness * 100) / 100}
                size={120}
                strokeColor={healthColor(m.goodness)}
                format={() => m.display}
              />
              <div style={{ marginTop: 8, fontSize: 13, color: BRAND_COLORS.TEXT }}>
                {m.name}
                {m.lowerBetter && <Text type="secondary" style={{ fontSize: 11 }}>（越低越好）</Text>}
              </div>
            </Col>
          ))}
        </Row>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          注：仪表盘填充度代表该项健康度（满分 100）。规则合规率 = OK 规则数 / 规则总数（{okCount}/{RULES.length}），低于 80% 标红提示需关注；回放误差为越低越优指标，已转换为健康度展示。
        </Text>
      </Card>
    </div>
  )
}
