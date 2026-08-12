// 康源品牌主题 - 主色 RGB(204,85,0) 即 #CC5500
// 衍生色阶用于按钮 hover/active、链接、强调态等
import { theme as antdTheme } from 'antd'

export const BRAND_COLORS = Object.freeze({
  PRIMARY: '#CC5500',         // 康源橙 主色
  PRIMARY_HOVER: '#B54800',   // hover 加深
  PRIMARY_ACTIVE: '#993D00', // active 更深
  PRIMARY_LIGHT: '#FFF3EA',  // 浅底色（用于选中行、tag 背景）
  PRIMARY_BG: '#FAF6F2',     // 全局背景偏暖
  TEXT: '#1D1D1F',
  TEXT_MUTED: '#6E6E73',
  BORDER: '#E2E2E6',
  SUCCESS: '#4A8A3B',
  WARNING: '#8A5A00',
  ERROR: '#B3261E',
  // 三大业务板块标识色（图表用）
  BU_MEIHONG: '#CC5500',     // 康源美宏 - 主色
  BU_FUZHI_EDU: '#2A6FB0',  // 福祉教育 - 蓝
  BU_QIXIANG: '#4A8A3B'     // 耆祥 - 绿
})

// Ant Design v5 token 主题配置
export const antdThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND_COLORS.PRIMARY,
    colorInfo: BRAND_COLORS.PRIMARY,
    colorLink: BRAND_COLORS.PRIMARY,
    colorSuccess: BRAND_COLORS.SUCCESS,
    colorWarning: BRAND_COLORS.WARNING,
    colorError: BRAND_COLORS.ERROR,
    colorTextBase: BRAND_COLORS.TEXT,
    colorBorder: BRAND_COLORS.BORDER,
    colorBgLayout: BRAND_COLORS.PRIMARY_BG,
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
    fontSize: 14,
    colorBgContainer: '#FFFFFF'
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      headerHeight: 56,
      headerPadding: '0 24px',
      bodyBg: BRAND_COLORS.PRIMARY_BG,
      siderBg: '#FFFFFF',
      headerShadow: '0 1px 4px rgba(0,0,0,0.04)'
    },
    Menu: {
      itemSelectedBg: BRAND_COLORS.PRIMARY_LIGHT,
      itemSelectedColor: BRAND_COLORS.PRIMARY,
      itemActiveBg: BRAND_COLORS.PRIMARY_LIGHT,
      itemHoverBg: '#FAFAFA'
    },
    Button: {
      primaryShadow: 'none',
      defaultBorderColor: BRAND_COLORS.BORDER
    },
    Table: {
      headerBg: '#FAFAFA',
      headerColor: BRAND_COLORS.TEXT_MUTED,
      rowHoverBg: BRAND_COLORS.PRIMARY_LIGHT,
      rowSelectedBg: BRAND_COLORS.PRIMARY_LIGHT,
      rowSelectedHoverBg: '#FFE6D1'
    },
    Card: {
      borderRadiusLG: 12
    }
  }
}
