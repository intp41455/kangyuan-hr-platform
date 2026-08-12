// 高管驾驶舱 - 三大业务板块对比
import React, { useMemo } from 'react'
import { Row, Col, Card, Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { BRAND_COLORS } from '../../theme.js'
import { BU_BREAKDOWN } from '../../mock/data.js'
import { getCurrentUser } from '../../mock/auth.js'

const { Title, Text } = Typography

// 卡片统一样式：圆角 12px、内边距 24px
const cardStyle = { borderRadius: 12 }
const cardBodyStyle = { padding: 24 }

export default function BUCompare() {
  const user = getCurrentUser()

  // 板块对比雷达图：6 维度归一化至 0-100（越高越好）
  const radarOption = useMemo(() => {
    const maxEmp = Math.max(...BU_BREAKDOWN.map(b => b.employees))
    const maxCost = Math.max(...BU_BREAKDOWN.map(b => b.monthlyCost))
    const maxAvg = Math.max(...BU_BREAKDOWN.map(b => b.avgSalary))
    const maxAnom = Math.max(...BU_BREAKDOWN.map(b => b.monthlyAnomaly))
    const prodBase = maxEmp / maxAnom // 人均产能代理基准（最高分）

    const dims = (b) => [
      +(b.employees / maxEmp * 100).toFixed(1),                            // 员工规模
      +(b.monthlyCost / maxCost * 100).toFixed(1),                         // 月度成本
      +(b.avgSalary / maxAvg * 100).toFixed(1),                            // 均薪水平
      +((1 - b.monthlyAnomaly / (maxAnom * 1.5)) * 100).toFixed(1),        // 异常率（控制度，越高越好）
      +(b.employees / b.monthlyAnomaly / prodBase * 100).toFixed(1),       // 人均产能（代理：人均异常稳定性）
      +(100 - b.monthlyAnomaly * 2).toFixed(1)                             // 合规率（代理）
    ]

    return {
      color: [BRAND_COLORS.BU_MEIHONG, BRAND_COLORS.BU_FUZHI_EDU, BRAND_COLORS.BU_QIXIANG],
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: BRAND_COLORS.TEXT_MUTED } },
      radar: {
        indicator: [
          { name: '员工规模', max: 100 },
          { name: '月度成本', max: 100 },
          { name: '均薪水平', max: 100 },
          { name: '异常率', max: 100 },
          { name: '人均产能', max: 100 },
          { name: '合规率', max: 100 }
        ],
        center: ['50%', '48%'],
        radius: '62%',
        axisName: { color: BRAND_COLORS.TEXT_MUTED },
        splitLine: { lineStyle: { color: BRAND_COLORS.BORDER } },
        splitArea: { areaStyle: { color: ['transparent', BRAND_COLORS.PRIMARY_LIGHT] } },
        axisLine: { lineStyle: { color: BRAND_COLORS.BORDER } }
      },
      series: [{
        type: 'radar',
        data: BU_BREAKDOWN.map(b => ({
          name: b.name,
          value: dims(b),
          lineStyle: { color: b.buColor, width: 2 },
          itemStyle: { color: b.buColor },
          areaStyle: { color: b.buColor, opacity: 0.15 }
        }))
      }]
    }
  }, [])

  // 板块均薪对比横向柱状图（升序，最高在顶部）
  const salaryBarOption = useMemo(() => {
    const sorted = [...BU_BREAKDOWN].sort((a, b) => a.avgSalary - b.avgSalary)
    return {
      color: [BRAND_COLORS.PRIMARY],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: v => `¥${Number(v).toLocaleString()}`
      },
      grid: { left: 80, right: 90, top: 20, bottom: 32 },
      xAxis: {
        type: 'value',
        name: '元/月',
        nameTextStyle: { color: BRAND_COLORS.TEXT_MUTED },
        axisLabel: { color: BRAND_COLORS.TEXT_MUTED, formatter: v => Number(v).toLocaleString() },
        splitLine: { lineStyle: { color: BRAND_COLORS.BORDER } },
        axisLine: { lineStyle: { color: BRAND_COLORS.BORDER } }
      },
      yAxis: {
        type: 'category',
        data: sorted.map(b => b.name),
        axisLine: { lineStyle: { color: BRAND_COLORS.BORDER } },
        axisLabel: { color: BRAND_COLORS.TEXT }
      },
      series: [{
        type: 'bar',
        barWidth: 24,
        data: sorted.map(b => ({
          value: b.avgSalary,
          itemStyle: { color: b.buColor, borderRadius: [0, 4, 4, 0] }
        })),
        label: {
          show: true,
          position: 'right',
          color: BRAND_COLORS.TEXT,
          formatter: ({ value }) => `¥${Number(value).toLocaleString()}`
        }
      }]
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0, color: BRAND_COLORS.TEXT }}>三大业务板块对比</Title>
        <Text type="secondary">高管驾驶舱{user?.name ? ` · 欢迎，${user.name}` : ''}</Text>
      </div>

      {/* 顶部三板块卡片，左侧 8px 板块色边条 */}
      <Row gutter={16}>
        {BU_BREAKDOWN.map(b => (
          <Col xs={24} lg={8} key={b.code}>
            <Card style={{ ...cardStyle, borderLeft: `8px solid ${b.buColor}` }} bodyStyle={cardBodyStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: BRAND_COLORS.TEXT }}>{b.name}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{b.fullName}</Text>
                </div>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: b.buColor, display: 'inline-block', marginTop: 6
                }} />
              </div>
              <Row gutter={[8, 12]} style={{ marginTop: 16 }}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>员工数</Text>
                  <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.TEXT }}>
                    {b.employees}<Text style={{ fontSize: 12 }}> 人</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>月度成本</Text>
                  <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.TEXT }}>
                    ¥{(b.monthlyCost / 10000).toFixed(1)}<Text style={{ fontSize: 12 }}> 万</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>均薪</Text>
                  <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.TEXT }}>
                    ¥{b.avgSalary.toLocaleString()}<Text style={{ fontSize: 12 }}> /月</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>月度异常</Text>
                  <div style={{ fontSize: 20, fontWeight: 700, color: b.monthlyAnomaly > 10 ? BRAND_COLORS.ERROR : BRAND_COLORS.WARNING }}>
                    {b.monthlyAnomaly}<Text style={{ fontSize: 12 }}> 起</Text>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 雷达图 + 均薪柱状图 */}
      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="板块对比雷达图" style={cardStyle} bodyStyle={cardBodyStyle}>
            <ReactECharts echarts={echarts} option={radarOption} style={{ height: 360 }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              注：各维度归一化至 0-100；异常率维度数值越高代表异常越少（控制越好）；人均产能与合规率为基于现有数据的代理指标。
            </Text>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="板块均薪对比" style={cardStyle} bodyStyle={cardBodyStyle}>
            <ReactECharts echarts={echarts} option={salaryBarOption} style={{ height: 360 }} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
