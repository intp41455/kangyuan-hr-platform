import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App.jsx'
import { antdThemeConfig } from './theme.js'

dayjs.locale('zh-cn')

// 钉钉 H5 容器鉴权：实际部署时需在 <App> 内调用 dingtalk-jsapi
// 当前为开发模式，使用 Mock 鉴权（见 src/mock/auth.js）

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
)
