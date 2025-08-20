--
-- Licensed to the Apache Software Foundation (ASF) under one or more
-- contributor license agreements.  See the NOTICE file distributed with
-- this work for additional information regarding copyright ownership.
-- The ASF licenses this file to You under the Apache License, Version 2.0
-- (the "License"); you may not use this file except in compliance with
-- the License.  You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--

local ngx = ngx
local core = require("apisix.core")
local http = require("resty.http")
local json = require("apisix.core.json")
local plugin = require("apisix.plugin")
local uuid = require("resty.jit-uuid")

-- 生成UUID
uuid.seed()

local plugin_name = "ai-proxy"

-- 插件加载时的日志
core.log.info("=== AI PROXY PLUGIN LOADED ===")
core.log.info("Plugin name: ", plugin_name)

-- 简单测试
local test_var = "test_value"
core.log.info("Test variable: ", test_var)

-- 插件配置模式
local schema = {
    type = "object",
    properties = {
        -- AI模型配置
        ai_model_url = {
            type = "string",
            default = "https://api.deepseek.com/v1/chat/completions",
            description = "AI模型API地址"
        },
        ai_model_key = {
            type = "string",
            description = "AI模型API密钥"
        },
        ai_model_name = {
            type = "string",
            default = "deepseek-chat",
            description = "AI模型名称"
        },
        
        -- 内容检测配置
        content_safety_url = {
            type = "string",
            default = "https://api.deepseek.com/v1/chat/completions",
            description = "内容安全检测API地址"
        },
        content_safety_key = {
            type = "string",
            description = "内容安全检测API密钥"
        },
        
        -- 检测配置
        enable_input_check = {
            type = "boolean",
            default = true,
            description = "是否启用输入内容检测"
        },
        enable_output_check = {
            type = "boolean",
            default = true,
            description = "是否启用输出内容检测"
        },
        block_harmful_content = {
            type = "boolean",
            default = true,
            description = "是否阻止有害内容"
        },
        mask_sensitive_info = {
            type = "boolean",
            default = true,
            description = "是否对敏感信息进行脱敏"
        },
        
        -- 敏感信息类型
        sensitive_types = {
            type = "array",
            default = {"email", "id_card", "phone", "bank_card", "address", "name"},
            items = {
                type = "string"
            },
            description = "需要检测的敏感信息类型"
        },
        
        -- 超时配置
        timeout = {
            type = "integer",
            default = 60000,
            minimum = 1000,
            maximum = 300000,
            description = "API调用超时时间（毫秒）"
        },
        
        -- 响应配置
        response_format = {
            type = "string",
            enum = {"json", "text"},
            default = "json",
            description = "响应格式"
        },
        
        -- OpenSearch日志配置
        enable_opensearch_log = {
            type = "boolean",
            default = true,
            description = "是否启用OpenSearch日志输出"
        },
        opensearch_url = {
            type = "string",
            default = "https://113.44.57.186:9200",
            description = "OpenSearch服务地址"
        },
        opensearch_index = {
            type = "string",
            default = "ai-proxy-logs",
            description = "OpenSearch索引名称"
        },
        opensearch_username = {
            type = "string",
            description = "OpenSearch用户名"
        },
        opensearch_password = {
            type = "string",
            description = "OpenSearch密码"
        },
        provider = {
            type = "string",
            default = "deepseek",
            description = "AI服务提供商"
        }
    },
    required = {"ai_model_key", "content_safety_key", "provider"}
}

local _M = {
    version = 0.1,
    priority = 2800,
    type = 'rewrite',
    name = plugin_name,
    schema = schema
}

-- 构建敏感信息识别规则
local function build_sensitive_rules(sensitive_types)
    local default_rules = {
        email = "邮箱(@)",
        id_card = "身份证(18/15位)",
        phone = "手机号(11位)",
        bank_card = "银行卡(16-19位)",
        address = "地址",
        name = "姓名",
        license_plate = "车牌号(京A12345)",
        passport = "护照号",
        social_security = "社保卡号",
        driver_license = "驾驶证号",
        engine_number = "发动机号",
        vin = "车架号",
        credit_card = "信用卡号",
        qq = "QQ号",
        wechat = "微信号",
        alipay = "支付宝",
        bank_account = "银行账户",
        ["邮箱"] = "邮箱(@)",
        ["身份证"] = "身份证(18/15位)",
        ["手机号"] = "手机号(11位)",
        ["银行卡"] = "银行卡(16-19位)",
        ["地址"] = "地址",
        ["姓名"] = "姓名",
        ["车牌号"] = "车牌号(京A12345)",
        ["护照"] = "护照号",
        ["社保卡"] = "社保卡号",
        ["驾驶证"] = "驾驶证号",
        ["发动机号"] = "发动机号",
        ["车架号"] = "车架号",
        ["信用卡"] = "信用卡号",
        ["QQ号"] = "QQ号",
        ["微信号"] = "微信号",
        ["支付宝"] = "支付宝",
        ["银行账户"] = "银行账户"
    }
    
    local rule_list = {}
    for _, type_name in ipairs(sensitive_types) do
        local rule = default_rules[type_name] or type_name
        table.insert(rule_list, rule)
    end
    
    return table.concat(rule_list, ",")
end

-- 构建内容检测提示词
local function build_safety_prompt(content, sensitive_types)
    local rules_text = build_sensitive_rules(sensitive_types)
    
    if #content < 200 then
        return string.format([[
请对以下内容进行安全检测，并用中文回复：

内容：%s

检测要求：
1. 检测是否包含有害信息（暴力、色情、政治敏感等）
2. 检测是否包含敏感信息：%s

请严格按照以下JSON格式返回中文结果：
{
    "is_harmful": true/false,
    "harmful_categories": ["有害类别"],
    "confidence": 0.0-1.0,
    "reason": "中文检测原因说明",
    "suggestions": "中文处理建议",
    "detected_harmful_types": ["检测到的有害信息类型"],
    "detected_sensitive_types": ["检测到的敏感信息类型"],
    "sensitive_info": [
        {
            "type": "敏感信息类型",
            "value": "原始值",
            "masked_value": "脱敏后的值",
            "position": "位置信息"
        }
    ]
}

注意：
- 如果没有检测到有害信息，harmful_categories和detected_harmful_types为空数组[]
- 如果没有检测到敏感信息，detected_sensitive_types为空数组[]，sensitive_info为空数组[]
- 如果检测到有害信息，请在detected_harmful_types中列出具体的有害信息类型
- 如果检测到敏感信息，请在detected_sensitive_types中列出具体的敏感信息类型
]], content, rules_text)
    else
        return string.format([[
请对以下内容进行安全检测，并用中文回复：

内容：%s

检测要求：
1. 检测是否包含有害信息（暴力、色情、政治敏感等）
2. 检测是否包含敏感信息：%s

请严格按照以下JSON格式返回中文结果：
{
    "is_harmful": true/false,
    "harmful_categories": ["有害类别"],
    "confidence": 0.0-1.0,
    "reason": "中文检测原因说明",
    "suggestions": "中文处理建议",
    "detected_harmful_types": ["检测到的有害信息类型"],
    "detected_sensitive_types": ["检测到的敏感信息类型"],
    "sensitive_info": [
        {
            "type": "敏感信息类型",
            "value": "原始值",
            "masked_value": "脱敏后的值",
            "position": "位置信息"
        }
    ]
}

注意：
- 如果没有检测到有害信息，harmful_categories和detected_harmful_types为空数组[]
- 如果没有检测到敏感信息，detected_sensitive_types为空数组[]，sensitive_info为空数组[]
- 如果检测到有害信息，请在detected_harmful_types中列出具体的有害信息类型
- 如果检测到敏感信息，请在detected_sensitive_types中列出具体的敏感信息类型
]], content, rules_text)
    end
end

-- 调用内容安全检测API
local function check_content_safety(conf, content)
    local httpc = http.new()
    
    -- 设置超时
    httpc:set_timeout({
        connect = 10000,  -- 增加连接超时
        send = 10000,      -- 增加发送超时
        read = 30000       -- 增加读取超时
    })
    
    -- 构建请求体
    local request_body = {
        model = "deepseek-chat",
        messages = {
            {
                role = "user",
                content = build_safety_prompt(content, conf.sensitive_types)
            }
        },
        temperature = 0.1,
        max_tokens = 800
    }
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. conf.content_safety_key
    }
    
    -- 发送请求
    local res, err = httpc:request_uri(conf.content_safety_url, {
        method = "POST",
        headers = headers,
        body = core.json.encode(request_body),
        ssl_verify = false,
        ssl_server_name = "api.deepseek.com"
    })
    
    if not res then
        return nil, "Failed to call content safety API: " .. (err or "unknown error")
    end
    
    if res.status ~= 200 then
        return nil, "Content safety API error: " .. res.status .. " - " .. res.body
    end
    
    -- 解析响应
    local response_data, err = core.json.decode(res.body)
    if not response_data then
        return nil, "Failed to parse content safety response: " .. (err or "unknown error")
    end
    
    -- 提取AI回复内容
    local ai_content = response_data.choices and response_data.choices[1] and response_data.choices[1].message and response_data.choices[1].message.content
    if not ai_content then
        return nil, "Invalid content safety response format"
    end
    
    -- 解析AI返回的JSON
    local safety_result, err = core.json.decode(ai_content)
    if not safety_result then
        -- 尝试清理AI响应中的非JSON内容
        local cleaned_content = ai_content:match("(%{.*%})")
        if cleaned_content then
            safety_result, err = core.json.decode(cleaned_content)
        end
        
        if not safety_result then
            return nil, "Failed to parse safety result: " .. (err or "unknown error")
        end
    end
    
    return safety_result
end

-- 敏感信息脱敏处理
local function mask_sensitive_content(content, sensitive_info)
    if not sensitive_info or #sensitive_info == 0 then
        return content
    end
    
    local masked_content = content
    
    -- 按位置从后往前替换，避免位置偏移
    table.sort(sensitive_info, function(a, b)
        return (a.position or 0) > (b.position or 0)
    end)
    
    for _, info in ipairs(sensitive_info) do
        if info.value and info.masked_value then
            masked_content = masked_content:gsub(info.value, info.masked_value, 1)
        end
    end
    
    return masked_content
end

-- 调用AI模型API
local function call_ai_model(conf, messages)
    local httpc = http.new()
    
    -- 设置超时
    httpc:set_timeout({
        connect = 10000,  -- 增加连接超时
        send = 10000,      -- 增加发送超时
        read = 60000       -- 增加读取超时
    })
    
    -- 构建请求体
    local request_body = {
        model = conf.ai_model_name,
        messages = messages,
        temperature = 0.7,
        max_tokens = 2000
    }
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. conf.ai_model_key
    }
    
    -- 发送请求
    local res, err = httpc:request_uri(conf.ai_model_url, {
        method = "POST",
        headers = headers,
        body = core.json.encode(request_body),
        ssl_verify = false,
        ssl_server_name = "api.deepseek.com"
    })
    
    if not res then
        return nil, "Failed to call AI model API: " .. (err or "unknown error")
    end
    
    if res.status ~= 200 then
        return nil, "AI model API error: " .. res.status .. " - " .. res.body
    end
    
    -- 解析响应
    local response_data, err = core.json.decode(res.body)
    if not response_data then
        return nil, "Failed to parse AI model response: " .. (err or "unknown error")
    end
    
    return response_data
end

-- 从请求中提取消息
local function extract_messages(conf, ctx)
    local content_type = core.request.header(ctx, "Content-Type") or ""
    
    -- 获取请求体
    local body, err = core.request.get_body(conf.timeout, ctx)
    if not body then
        return nil, "Failed to get request body: " .. (err or "empty body")
    end
    
    local content_data
    
    -- 根据 Content-Type 解析
    if content_type:find("application/json") then
        content_data, err = core.json.decode(body)
        if not content_data then
            return nil, "Failed to parse JSON body: " .. (err or "invalid JSON")
        end
    else
        return nil, "Only application/json content type is supported"
    end
    
    -- 提取消息
    local messages = content_data.messages
    if not messages or type(messages) ~= "table" then
        return nil, "Messages field not found or invalid"
    end
    
    return messages
end

-- 发送日志到OpenSearch
local function send_to_opensearch(conf, log_data)
    ngx.log(ngx.INFO, "=== OpenSearch Logging Debug ===")
    ngx.log(ngx.INFO, "enable_opensearch_log: ", conf.enable_opensearch_log)
    
    if not conf.enable_opensearch_log then
        ngx.log(ngx.INFO, "OpenSearch logging is disabled")
        return
    end
    
    ngx.log(ngx.INFO, "Attempting to send log to OpenSearch: ", conf.opensearch_url)
    
    local httpc = http.new()
    httpc:set_timeout(5000) -- 日志发送超时时间较短
    
    -- 构建OpenSearch请求URL
    local url = conf.opensearch_url .. "/" .. conf.opensearch_index .. "/_doc"
    ngx.log(ngx.INFO, "OpenSearch URL: ", url)
    
    -- 构建请求头
    local headers = {
        ["Content-Type"] = "application/json"
    }
    
    -- 如果配置了认证信息
    ngx.log(ngx.WARN, "OpenSearch username: ", conf.opensearch_username or "nil")
    ngx.log(ngx.WARN, "OpenSearch password: ", conf.opensearch_password and "***" or "nil")
    if conf.opensearch_username and conf.opensearch_password then
        local auth = ngx.encode_base64(conf.opensearch_username .. ":" .. conf.opensearch_password)
        headers["Authorization"] = "Basic " .. auth
        ngx.log(ngx.WARN, "Using Basic Auth for OpenSearch")
    else
        ngx.log(ngx.WARN, "No OpenSearch credentials provided")
    end
    
    -- 发送POST请求到OpenSearch
    local res, err = httpc:request_uri(url, {
        method = "POST",
        headers = headers,
        body = core.json.encode(log_data),
        ssl_verify = false
    })
    
    if not res then
        ngx.log(ngx.ERR, "Failed to send log to OpenSearch: ", err)
        return
    end
    
    ngx.log(ngx.WARN, "OpenSearch response status: ", res.status)
    
    if res.status ~= 200 and res.status ~= 201 then
        ngx.log(ngx.ERR, "OpenSearch log error: ", res.status, " - ", res.body)
        return
    end
    
    ngx.log(ngx.WARN, "=== SUCCESSFULLY SENT LOG TO OPENSEARCH ===")
end

-- 生成响应
local function generate_response(ai_response, input_safety, output_safety, conf)
    if conf.response_format == "json" then
        local response_data = {
            success = true,
            ai_response = ai_response,
            safety_check = input_safety,  -- 输入检测结果
            output_safety_check = output_safety  -- 输出检测结果
        }
        
        return 200, response_data
    else
        local ai_content = ai_response.choices and ai_response.choices[1] and ai_response.choices[1].message and ai_response.choices[1].message.content or ""
        local input_status = input_safety.is_harmful and "HARMFUL" or "SAFE"
        local output_status = output_safety and (output_safety.is_harmful and "HARMFUL" or "SAFE") or "NOT_CHECKED"
        
        local response_text = string.format("AI Response: %s\n\nInput Safety Check: %s\nOutput Safety Check: %s", 
            ai_content, input_status, output_status)
        
        return 200, response_text
    end
end

-- 主处理函数
function _M.rewrite(conf, ctx)
    -- 使用core.log.warn确保日志能显示
    core.log.warn("=== AI PROXY PLUGIN REWRITE FUNCTION CALLED ===")
    core.log.warn("Plugin configuration: ", core.json.encode(conf))
    core.log.warn("Request URI: ", ngx.var.request_uri)
    -- 设置响应头
    ngx.header["Content-Type"] = "application/json"
    
    -- 记录开始时间
    local start_time = ngx.now() * 1000 -- 转换为毫秒
    
    -- 生成会话ID
    local session_id = uuid()
    local request_id = uuid()
    
    -- 获取客户端信息
    local client_ip = ngx.var.remote_addr or "unknown"
    local user_agent = core.request.header(ctx, "User-Agent") or "Unknown"
    
    -- 提取消息
    local messages, err = extract_messages(conf, ctx)
    if not messages then
        ngx.status = 400
        ngx.say(core.json.encode({
            success = false,
            error = err
        }))
        ngx.exit(400)
    end
    
    -- 获取用户输入（最后一条用户消息）
    local user_input = ""
    for i = #messages, 1, -1 do
        if messages[i].role == "user" then
            user_input = messages[i].content
            break
        end
    end
    
    if user_input == "" then
        ngx.status = 400
        ngx.say(core.json.encode({
            success = false,
            error = "No user input found in messages"
        }))
        ngx.exit(400)
    end
    
    core.log.info("User input: ", user_input)
    
    -- 网关层过滤由 ai-prompt-guard 插件负责
    local gateway_filter_status = "passed"
    local gateway_matched_patterns = {}
    
    -- 初始化日志数据结构
    local log_data = {
        session_id = session_id,
        request_id = request_id,
        timestamp = os.date("!%Y-%m-%dT%H:%M:%S.000Z", ngx.time()),
        client_ip = client_ip,
        user_agent = user_agent,
        plugin = "ai-proxy",
        phase = "ai_processing",
        gateway_filter = {
            status = gateway_filter_status,
            matched_patterns = gateway_matched_patterns,
            processing_time_ms = 0
        },
        user_input = {
            content = user_input,
            content_length = #user_input,
            detection_result = {},
            detected_harmful_types = nil,
            detected_sensitive_types = nil,
            was_blocked = false,
            block_reason = ""
        },
        ai_response = {
            content = "",
            content_length = 0,
            model = conf.ai_model_name,
            detection_result = {},
            detected_harmful_types = nil,
            detected_sensitive_types = nil,
            was_blocked = false,
            tokens_used = 0
        },
        metrics = {
            total_response_time_ms = 0,
            input_check_time_ms = 0,
            ai_processing_time_ms = 0,
            output_check_time_ms = 0,
            status = "processing"
        }
    }
    
    -- 检测用户输入
    local input_safety = nil
    local input_check_start = ngx.now() * 1000
    
    if conf.enable_input_check then
        input_safety, err = check_content_safety(conf, user_input)
        if not input_safety then
            core.log.error("Input safety check failed: ", err)
            ngx.status = 500
                    ngx.say(core.json.encode({
                success = false,
                error = "Input safety check failed: " .. err
        }))
            ngx.exit(500)
        end
        
        core.log.info("Input safety result: ", core.json.encode(input_safety))
        
        -- 记录输入检测结果
        log_data.user_input.detection_result = input_safety
        -- 设置有害信息类型
        if input_safety.detected_harmful_types and #input_safety.detected_harmful_types > 0 then
            log_data.user_input.detected_harmful_types = input_safety.detected_harmful_types
        elseif input_safety.harmful_categories and #input_safety.harmful_categories > 0 then
            log_data.user_input.detected_harmful_types = input_safety.harmful_categories
        end
        -- 从敏感信息中提取类型
        local sensitive_types = {}
        if input_safety.sensitive_info and #input_safety.sensitive_info > 0 then
            for _, info in ipairs(input_safety.sensitive_info) do
                if info.type then
                    table.insert(sensitive_types, info.type)
                end
            end
        end
        if input_safety.detected_sensitive_types and #input_safety.detected_sensitive_types > 0 then
            log_data.user_input.detected_sensitive_types = input_safety.detected_sensitive_types
        elseif #sensitive_types > 0 then
            log_data.user_input.detected_sensitive_types = sensitive_types
        end
        log_data.metrics.input_check_time_ms = math.floor((ngx.now() * 1000) - input_check_start)
        
        -- 如果检测到有害内容且配置为阻止
        if conf.block_harmful_content and input_safety.is_harmful then
            log_data.user_input.was_blocked = true
            log_data.user_input.block_reason = "用户输入中检测到有害内容"
            log_data.metrics.status = "blocked_input"
            
            -- 发送日志到OpenSearch
            send_to_opensearch(conf, log_data)
            
            ngx.status = 403
            ngx.say(core.json.encode({
                success = false,
                error = "用户输入中检测到有害内容",
                data = {
                    is_harmful = true,
                    harmful_categories = input_safety.harmful_categories or {},
                    confidence = input_safety.confidence or 0.0,
                    reason = input_safety.reason or "",
                    suggestions = input_safety.suggestions or "",
                    detected_content = user_input,
                    harmful_details = input_safety.harmful_categories or {}
                }
            }))
            ngx.exit(403)
        end
        
        -- 如果检测到敏感信息，返回敏感信息详情
        if input_safety.sensitive_info and #input_safety.sensitive_info > 0 then
            log_data.user_input.was_blocked = true
            log_data.user_input.block_reason = "用户输入中检测到敏感信息"
            log_data.metrics.status = "blocked_sensitive_input"
            
            -- 发送日志到OpenSearch
            send_to_opensearch(conf, log_data)
            
            ngx.status = 403
            ngx.say(core.json.encode({
                success = false,
                error = "用户输入中检测到敏感信息",
                data = {
                    is_harmful = false,
                    has_sensitive_info = true,
                    sensitive_info = input_safety.sensitive_info,
                    detected_content = user_input,
                    reason = "检测到敏感信息，请修改后重试",
                    suggestions = "请移除或修改敏感信息后重试"
                }
            }))
            ngx.exit(403)
        end
        
        -- 对敏感信息进行脱敏
        if conf.mask_sensitive_info and input_safety.sensitive_info and #input_safety.sensitive_info > 0 then
            local masked_input = mask_sensitive_content(user_input, input_safety.sensitive_info)
            -- 更新消息中的用户输入
            for i = #messages, 1, -1 do
                if messages[i].role == "user" then
                    messages[i].content = masked_input
                    break
                end
            end
            core.log.info("Masked user input: ", masked_input)
        end
    end
    
    -- 调用AI模型
    local ai_processing_start = ngx.now() * 1000
    local ai_response, err = call_ai_model(conf, messages)
    if not ai_response then
        core.log.error("AI model call failed: ", err)
        log_data.metrics.status = "error"
        log_data.metrics.ai_processing_time_ms = math.floor((ngx.now() * 1000) - ai_processing_start)
        
        -- 发送错误日志到OpenSearch
        send_to_opensearch(conf, log_data)
        
        ngx.status = 500
        ngx.say(core.json.encode({
            success = false,
            error = "AI model call failed: " .. err
        }))
        ngx.exit(500)
    end
    
    core.log.info("AI model response received")
    core.log.info("=== AI MODEL CALL COMPLETED ===")
    
    -- 记录AI响应信息
    local ai_content = ai_response.choices and ai_response.choices[1] and ai_response.choices[1].message and ai_response.choices[1].message.content or ""
    log_data.ai_response.content = ai_content
    log_data.ai_response.content_length = #ai_content
    log_data.ai_response.tokens_used = ai_response.usage and ai_response.usage.total_tokens or 0
    log_data.metrics.ai_processing_time_ms = math.floor((ngx.now() * 1000) - ai_processing_start)
    
    -- 检测AI输出
    local output_check_start = ngx.now() * 1000
    
    if conf.enable_output_check then
        if ai_content and ai_content ~= "" then
            local output_safety, err = check_content_safety(conf, ai_content)
            if not output_safety then
                core.log.error("Output safety check failed: ", err)
                log_data.metrics.status = "error"
                log_data.metrics.output_check_time_ms = math.floor((ngx.now() * 1000) - output_check_start)
                
                -- 发送错误日志到OpenSearch
                send_to_opensearch(conf, log_data)
                
                ngx.status = 500
                ngx.say(core.json.encode({
                    success = false,
                    error = "Output safety check failed: " .. err
                }))
                ngx.exit(500)
            end
            
            core.log.info("Output safety result: ", core.json.encode(output_safety))
            
            -- 记录输出检测结果
            log_data.ai_response.detection_result = output_safety
            -- 设置有害信息类型
            if output_safety.detected_harmful_types and #output_safety.detected_harmful_types > 0 then
                log_data.ai_response.detected_harmful_types = output_safety.detected_harmful_types
            elseif output_safety.harmful_categories and #output_safety.harmful_categories > 0 then
                log_data.ai_response.detected_harmful_types = output_safety.harmful_categories
            end
            -- 从敏感信息中提取类型
            local sensitive_types = {}
            if output_safety.sensitive_info and #output_safety.sensitive_info > 0 then
                for _, info in ipairs(output_safety.sensitive_info) do
                    if info.type then
                        table.insert(sensitive_types, info.type)
                    end
                end
            end
            if output_safety.detected_sensitive_types and #output_safety.detected_sensitive_types > 0 then
                log_data.ai_response.detected_sensitive_types = output_safety.detected_sensitive_types
            elseif #sensitive_types > 0 then
                log_data.ai_response.detected_sensitive_types = sensitive_types
            end
            log_data.metrics.output_check_time_ms = math.floor((ngx.now() * 1000) - output_check_start)
            
            -- 如果检测到有害内容且配置为阻止
            if conf.block_harmful_content and output_safety.is_harmful then
                log_data.ai_response.was_blocked = true
                log_data.metrics.status = "blocked_output"
                
                -- 发送日志到OpenSearch
                send_to_opensearch(conf, log_data)
                
                ngx.status = 403
                ngx.say(core.json.encode({
                    success = false,
                    error = "AI回复中检测到有害内容",
                    data = {
                        is_harmful = true,
                        harmful_categories = output_safety.harmful_categories or {},
                        confidence = output_safety.confidence or 0.0,
                        reason = output_safety.reason or "",
                        suggestions = output_safety.suggestions or "",
                        detected_content = ai_content,
                        harmful_details = output_safety.harmful_categories or {}
                    }
                }))
                ngx.exit(403)
            end
            
            -- 如果检测到敏感信息，返回敏感信息详情
            if output_safety.sensitive_info and #output_safety.sensitive_info > 0 then
                log_data.ai_response.was_blocked = true
                log_data.metrics.status = "blocked_sensitive_output"
                
                -- 发送日志到OpenSearch
                send_to_opensearch(conf, log_data)
                
                ngx.status = 403
                ngx.say(core.json.encode({
                    success = false,
                    error = "AI回复中检测到敏感信息",
                    data = {
                        is_harmful = false,
                        has_sensitive_info = true,
                        sensitive_info = output_safety.sensitive_info,
                        detected_content = ai_content,
                        reason = "AI回复中包含敏感信息",
                        suggestions = "请重新提问，避免生成敏感信息"
                    }
                }))
                ngx.exit(403)
            end
            
            -- 对敏感信息进行脱敏
            if conf.mask_sensitive_info and output_safety.sensitive_info and #output_safety.sensitive_info > 0 then
                local masked_content = mask_sensitive_content(ai_content, output_safety.sensitive_info)
                ai_response.choices[1].message.content = masked_content
                log_data.ai_response.content = masked_content -- 更新日志中的内容为脱敏后的内容
                core.log.info("Masked AI output: ", masked_content)
            end
        end
    end
    
    -- 计算总响应时间并完成日志
    core.log.warn("=== FINAL PROCESSING SECTION ===")
    log_data.metrics.total_response_time_ms = math.floor((ngx.now() * 1000) - start_time)
    log_data.metrics.status = "completed"
    
    -- 发送成功日志到OpenSearch
    core.log.warn("=== FINAL LOGGING SECTION ===")
    core.log.warn("About to send log to OpenSearch...")
    core.log.warn("log_data status: ", log_data.metrics.status)
    send_to_opensearch(conf, log_data)
    core.log.warn("OpenSearch log sent (or attempted)")
    
    -- 返回结果
    local response_data = {
        success = true,
        ai_response = ai_response,
        safety_check = input_safety or {},  -- 输入检测结果
        output_safety_check = log_data.ai_response.detection_result or {},  -- 输出检测结果
        input_sensitive_info = input_safety and input_safety.sensitive_info or {},  -- 输入敏感信息
        output_sensitive_info = log_data.ai_response.detection_result and log_data.ai_response.detection_result.sensitive_info or {}  -- 输出敏感信息
    }
    
    ngx.say(core.json.encode(response_data))
    ngx.exit(200)
end

-- 配置验证
function _M.check_schema(conf, schema_type)
    return core.schema.check(schema, conf)
end

-- 插件初始化
function _M.init()
    core.log.info("AI proxy plugin initialized")
end

return _M 