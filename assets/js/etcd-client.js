/**
 * etcd客户端工具类
 * 用于操作etcd中的插件配置模板
 */
class EtcdClient {
    constructor(config) {
        this.config = config || {};
        // 写死etcd地址为Docker环境地址
        this.baseUrl = 'http://localhost:2379';  // 你的etcd Docker容器地址
        this.prefix = '/plugin_templates';  // 写死前缀
        this.apisixPrefix = '/apisix';  // 写死APISIX前缀
        
        // 不设置默认模板，让用户自己创建
        if (!this.config.plugin_templates) {
            this.config.plugin_templates = {
                prefix: '/plugin_templates',
                default_templates: []
            };
        }
        
        console.log('EtcdClient初始化完成，配置:', {
            baseUrl: this.baseUrl,
            prefix: this.prefix,
            defaultTemplatesCount: 0
        });
    }

    /**
     * 安全的UTF-8编码方法
     * @param {string} str - 要编码的字符串
     * @returns {string} base64编码的字符串
     */
    safeEncode(str) {
        try {
            // 使用TextEncoder确保UTF-8编码
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            // 将Uint8Array转换为base64
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } catch (error) {
            console.warn('TextEncoder不可用，使用兼容方法:', error);
            // 兼容性处理
            return btoa(unescape(encodeURIComponent(str)));
        }
    }

    /**
     * 安全的UTF-8解码方法
     * @param {string} base64Str - base64编码的字符串
     * @returns {string} 解码后的字符串
     */
    safeDecode(base64Str) {
        try {
            // 使用TextDecoder确保UTF-8解码
            const binary = atob(base64Str);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(bytes);
        } catch (error) {
            console.warn('TextDecoder不可用，使用兼容方法:', error);
            // 兼容性处理
            try {
                return decodeURIComponent(escape(atob(base64Str)));
            } catch (e2) {
                console.error('兼容解码也失败:', e2);
                return base64Str; // 返回原始字符串
            }
        }
    }

    /**
     * 安全的UTF-8编码方法
     * @param {string} str - 要编码的字符串
     * @returns {string} base64编码的字符串
     */
    safeEncode(str) {
        try {
            // 使用TextEncoder确保UTF-8编码
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            // 将Uint8Array转换为base64
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } catch (error) {
            console.warn('TextEncoder不可用，使用兼容方法:', error);
            // 兼容性处理
            return btoa(unescape(encodeURIComponent(str)));
        }
    }

    /**
     * 安全的UTF-8解码方法
     * @param {string} base64Str - base64编码的字符串
     * @returns {string} 解码后的字符串
     */
    safeDecode(base64Str) {
        try {
            // 使用TextDecoder确保UTF-8解码
            const binary = atob(base64Str);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(bytes);
        } catch (error) {
            console.warn('TextDecoder不可用，使用兼容方法:', error);
            // 兼容性处理
            try {
                return decodeURIComponent(escape(atob(base64Str)));
            } catch (e2) {
                console.error('兼容解码也失败:', e2);
                return base64Str; // 返回原始字符串
            }
        }
    }

    /**
     * 构建etcd key
     * @param {string} key - 键名
     * @returns {string} 完整的etcd key
     */
    buildKey(key) {
        return `${this.prefix}/${key}`;
    }

    /**
     * 获取配置模板列表
     * @returns {Promise<Array>} 配置模板列表
     */
    async getTemplates() {
        try {
            console.log('=== 从etcd获取配置模板 ===');
            
            // 使用etcd的range查询获取所有模板
            // etcd v3 API需要base64编码
            const keyBase64 = this.safeEncode(this.prefix);
            
            // 使用不同的方法构建range_end：在prefix后面加一个字符，确保范围包含所有以prefix开头的key
            const rangeEnd = this.prefix + 'z'; // 使用'z'作为范围结束，因为ASCII中'z' > '/'
            const rangeEndBase64 = this.safeEncode(rangeEnd);
            
            console.log('etcd range查询参数:', {
                key: this.prefix,
                keyBase64: keyBase64,
                rangeEnd: rangeEnd,
                rangeEndBase64: rangeEndBase64
            });
            
            // 调试：检查实际的key路径
            console.log('调试：检查实际的key路径');
            console.log('prefix:', this.prefix);
            console.log('rangeEnd:', rangeEnd);
            console.log('rangeEnd (hex):', Array.from(rangeEnd).map(c => c.charCodeAt(0).toString(16)));
            console.log('rangeEnd (length):', rangeEnd.length);
            
            const response = await fetch(`${this.baseUrl}/v3/kv/range`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: keyBase64,
                    range_end: rangeEndBase64,
                    limit: 1000
                })
            });

            if (!response.ok) {
                throw new Error(`etcd请求失败: ${response.status}`);
            }

            const data = await response.json();
            console.log('etcd原始响应:', data);

            if (!data.kvs || data.kvs.length === 0) {
                console.log('etcd中没有找到配置模板，返回空数组');
                return [];
            }

            // 解析etcd返回的数据
            const templates = data.kvs.map(kv => {
                try {
                    let template;
                    // etcd v3 API返回的value是base64编码的，需要先解码
                    if (kv.value && typeof kv.value === 'string') {
                        try {
                            // 使用安全的UTF-8解码方法
                            const decodedValue = this.safeDecode(kv.value);
                            template = JSON.parse(decodedValue);
                        } catch (e) {
                            console.error('base64解码失败，尝试直接解析:', e);
                            // 如果base64解码失败，尝试直接解析（兼容性处理）
                            try {
                                template = JSON.parse(kv.value);
                            } catch (e2) {
                                console.error('直接解析也失败:', e2);
                                return null;
                            }
                        }
                    }
                    return template;
                } catch (error) {
                    console.error('解析模板数据失败:', error, kv.value);
                    return null;
                }
            }).filter(Boolean);

            console.log('从etcd解析的模板:', templates);
            return templates;

        } catch (error) {
            console.error('获取配置模板失败:', error);
            // 如果etcd不可用，返回空数组
            return [];
        }
    }

    /**
     * 保存配置模板
     * @param {Object} template - 配置模板对象
     * @returns {Promise<Object>} 保存结果
     */
    async saveTemplate(template) {
        try {
            console.log('=== 保存配置模板到etcd ===');
            console.log('要保存的模板:', template);
            console.log('etcd基础URL:', this.baseUrl);

            const key = this.buildKey(template.id);
            const value = JSON.stringify(template);

            // 使用安全的UTF-8编码方法
            const keyBase64 = this.safeEncode(key);
            const valueBase64 = this.safeEncode(value);
            
            // 调试：检查编码过程
            console.log('编码调试信息:');
            console.log('原始key:', key);
            console.log('原始value:', value);
            console.log('key编码过程:', {
                safeEncode: keyBase64
            });
            console.log('value编码过程:', {
                safeEncode: valueBase64
            });

            console.log('etcd请求参数:', {
                key: key,
                keyBase64: keyBase64,
                value: value,
                valueBase64: valueBase64
            });

            const requestBody = {
                key: keyBase64,
                value: valueBase64
            };

            console.log('发送到etcd的请求体:', requestBody);
            console.log('请求URL:', `${this.baseUrl}/v3/kv/put`);

            const response = await fetch(`${this.baseUrl}/v3/kv/put`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('etcd响应状态:', response.status, response.statusText);
            console.log('etcd响应头:', response.headers);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('etcd响应错误:', response.status, errorText);
                throw new Error(`保存模板失败: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('模板保存成功:', result);
            
            return {
                success: true,
                template: template,
                etcd_response: result
            };

        } catch (error) {
            console.error('保存配置模板失败:', error);
            console.error('错误堆栈:', error.stack);
            throw error;
        }
    }

    /**
     * 删除配置模板
     * @param {string} templateId - 模板ID
     * @returns {Promise<Object>} 删除结果
     */
            async deleteTemplate(templateId) {
            try {
                console.log('=== 从etcd删除配置模板 ===');
                console.log('要删除的模板ID:', templateId);

                const key = this.buildKey(templateId);
                const keyBase64 = this.safeEncode(key);

            const response = await fetch(`${this.baseUrl}/v3/kv/deleterange`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: keyBase64
                })
            });

            if (!response.ok) {
                throw new Error(`删除模板失败: ${response.status}`);
            }

            const result = await response.json();
            console.log('模板删除成功:', result);
            
            return {
                success: true,
                template_id: templateId,
                etcd_response: result
            };

        } catch (error) {
            console.error('删除配置模板失败:', error);
            throw error;
        }
    }

    /**
     * 更新配置模板
     * @param {Object} template - 配置模板对象
     * @returns {Promise<Object>} 更新结果
     */
    async updateTemplate(template) {
        try {
            console.log('=== 更新配置模板到etcd ===');
            console.log('要更新的模板:', template);

            // 检查模板是否存在
            const existingTemplate = await this.getTemplateById(template.id);
            if (!existingTemplate) {
                throw new Error(`模板不存在: ${template.id}`);
            }

            // 更新修改时间
            template.updated_at = new Date().toISOString();

            // 保存更新后的模板
            return await this.saveTemplate(template);

        } catch (error) {
            console.error('更新配置模板失败:', error);
            throw error;
        }
    }

    /**
     * 根据ID获取单个模板
     * @param {string} templateId - 模板ID
     * @returns {Promise<Object|null>} 配置模板对象
     */
            async getTemplateById(templateId) {
            try {
                const key = this.buildKey(templateId);
                const keyBase64 = this.safeEncode(key);

            const response = await fetch(`${this.baseUrl}/v3/kv/range`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: keyBase64
                })
            });

            if (!response.ok) {
                throw new Error(`获取模板失败: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.kvs || data.kvs.length === 0) {
                return null;
            }

            // 解析value
            try {
                let template;
                const value = data.kvs[0].value;
                
                // etcd v3 API返回的value是base64编码的，需要先解码
                try {
                    const decodedValue = this.safeDecode(value);
                    template = JSON.parse(decodedValue);
                } catch (e) {
                    console.error('base64解码失败，尝试直接解析:', e);
                    // 如果base64解码失败，尝试直接解析（兼容性处理）
                    try {
                        template = JSON.parse(value);
                    } catch (e2) {
                        console.error('直接解析也失败:', e2);
                        return null;
                    }
                }
                
                return template;
            } catch (error) {
                console.error('解析模板数据失败:', error, data.kvs[0].value);
                return null;
            }

        } catch (error) {
            console.error('获取单个模板失败:', error);
            return null;
        }
    }

    /**
     * 初始化默认配置模板
     * @returns {Promise<void>}
     */
    async initializeDefaultTemplates() {
        try {
            console.log('=== 初始化默认配置模板到etcd ===');
            console.log('没有默认模板配置，跳过初始化');
            return;
        } catch (error) {
            console.error('初始化默认配置模板失败:', error);
            throw error;
        }
    }

    /**
     * 测试etcd连接
     * @returns {Promise<boolean>} 连接状态
     */
            async testConnection() {
            try {
                // 使用更简单的连接测试方法 - 测试一个不存在的key
                const response = await fetch(`${this.baseUrl}/v3/kv/range`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        key: this.safeEncode('/nonexistent-key-for-test'),
                        limit: 1
                    })
                });
            
            // 即使key不存在，只要API能响应就说明连接正常
            console.log('etcd连接测试响应:', response.status, response.ok);
            return true; // 只要能连接就返回true
        } catch (error) {
            console.error('etcd连接测试失败:', error);
            return false;
        }
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新的配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        // 保持写死的地址不变
        // this.baseUrl = 'http://localhost:2379';  // 固定etcd地址
        // this.prefix = '/plugin_templates';  // 固定前缀
        // this.apisixPrefix = '/apisix';  // 固定APISIX前缀
        
        console.log('etcd客户端配置已更新，但地址保持固定:', {
            baseUrl: this.baseUrl,
            prefix: this.prefix,
            apisixPrefix: this.apisixPrefix
        });
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EtcdClient;
} else {
    window.EtcdClient = EtcdClient;
}
