// APISIX Admin Panel - Single Page Application
class APISIXAdmin {
    constructor() {
        this.currentPage = 'dashboard';
        this.isEditingCustom = null; // 当前处于编辑模式的自定义仪表板ID（非默认）
        this.googleChartsReady = false;
        this.googleChartsLoading = false;
        
        // 排序相关变量
        this.currentSortField = null;
        this.currentSortDirection = 'asc';
        
        // 服务管理相关变量
        this.currentServicePlugins = [];
        this.currentConsumerPlugins = [];
        
        // 插件配置模板 - 现在直接从etcd读取，不需要内存变量
        
        // 初始化插件列表
        this.allPlugins = [];
        
        // APISIX API配置
        const savedConfig = localStorage.getItem('apisixConfig');
        this.apisixConfig = savedConfig ? JSON.parse(savedConfig) : {
            baseUrl: 'http://localhost:9180/apisix/admin',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': 'edd1c9f034335f136f87ad84b625c8f1'
            }
        };
        
        this.init();
    }

    async init() {
        console.log('APISIX Admin Panel initialized');
        
        // 初始化数据存储
        await this.initDataStorage();
        
        this.bindEvents();
        
        // 初始化仪表板选择器
        setTimeout(() => {
            this.updateDashboardSelector();
        }, 100);
        
        // 确保默认显示仪表板内容
        const contentDiv = document.getElementById('dynamic-content');
        if (contentDiv) {
            this.loadDashboardContent(contentDiv);
            // 自动显示默认仪表板
            setTimeout(() => {
                this.switchDashboard('default');
            }, 200);
        }
        
        // 设置默认激活的菜单项
        setTimeout(() => {
            console.log('初始化时设置默认激活菜单');
            this.setActiveMenuItem('dashboard');
        }, 100);
        
        // 再次确保激活状态
        setTimeout(() => {
            this.setActiveMenuItem('dashboard');
        }, 500);
        
        // 测试APISIX连接
        this.testAPISIXConnection();
        
        // 配置模板现在直接从etcd读取，不需要强制刷新
    }
    
    // 测试APISIX连接
    async testAPISIXConnection() {
        const statusDiv = document.getElementById('connection-status');
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="alert alert-info">
                    <i class="mdi mdi-clock-outline"></i>
                    正在测试连接...
                </div>
            `;
        }
        
        try {
            console.log('测试APISIX连接...');
            const status = await this.getAPISIXStatus();
            if (status) {
                console.log('APISIX连接成功:', status);
                this.showNotification('APISIX连接成功', 'success');
                
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <div class="alert alert-success">
                            <i class="mdi mdi-check-circle"></i>
                            <strong>连接成功！</strong><br>
                            APISIX版本: ${status.apisix_version || '未知'}<br>
                            节点ID: ${status.node_id || '未知'}
                        </div>
                    `;
                }
                
                // 测试消费者API是否可用
                await this.testConsumersAPI();
            } else {
                console.log('APISIX连接失败');
                this.showNotification('APISIX连接失败，请检查配置', 'warning');
                
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <div class="alert alert-warning">
                            <i class="mdi mdi-alert-circle"></i>
                            <strong>连接失败！</strong><br>
                            无法获取APISIX状态信息
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('APISIX连接测试失败:', error);
            this.showNotification('APISIX连接失败: ' + error.message, 'error');
            
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="mdi mdi-close-circle"></i>
                        <strong>连接失败！</strong><br>
                        错误信息: ${error.message}
                    </div>
                `;
            }
        }
    }

    // 测试消费者API
    async testConsumersAPI() {
        try {
            console.log('测试消费者API...');
            
            // 测试读取消费者列表
            const consumers = await this.getConsumers();
            console.log('消费者API读取测试成功，当前消费者数量:', consumers.length);
            
            // 测试创建消费者的API是否可用
            const testConsumerId = `test-consumer-${Date.now()}`;
            const testData = {
                username: testConsumerId, // 确保username与URL路径中的ID一致
                desc: '测试消费者',
                plugins: {
                    'key-auth': {
                        key: 'test-key-123'
                    }
                }
            };
            
            console.log('测试创建消费者API...');
            console.log('测试数据:', testData);
            console.log('测试URL:', `${this.apisixConfig.baseUrl}/consumers/${testConsumerId}`);
            
            try {
                // 尝试创建测试消费者
                const response = await this.apisixRequest(`/consumers/${testConsumerId}`, {
                    method: 'PUT',
                    body: JSON.stringify(testData)
                });
                console.log('创建测试消费者成功:', response);
                
                // 立即删除测试消费者
                await this.apisixRequest(`/consumers/${testConsumerId}`, {
                    method: 'DELETE'
                });
                console.log('删除测试消费者成功');
                
                this.showNotification('消费者API完全可用（创建/删除测试成功）', 'success');
            } catch (createError) {
                console.error('创建测试消费者失败:', createError);
                this.showNotification(`消费者API读取正常，但创建失败: ${createError.message}`, 'warning');
            }
            
        } catch (error) {
            console.error('消费者API测试失败:', error);
            this.showNotification('消费者API不可用: ' + error.message, 'warning');
        }
    }


    // 加载API配置页面
    loadAPIConfigContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <h4 class="card-title mb-1">APISIX API配置</h4>
                                    <p class="text-muted mb-0">配置APISIX管理API连接参数</p>
                                </div>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-primary" onclick="window.apisixAdmin.testAPISIXConnection()">
                                        <i class="mdi mdi-connection"></i> 测试连接
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.refreshAPISIXData()">
                                        <i class="mdi mdi-refresh"></i> 刷新数据
                                    </button>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card border">
                                        <div class="card-body">
                                            <h5 class="card-title">
                                                <i class="mdi mdi-cog text-primary"></i>
                                                API连接配置
                                            </h5>
                                            
                                            <div class="form-group">
                                                <label class="form-label">APISIX Admin API地址</label>
                                                <input type="text" class="form-control" id="apisix-base-url" 
                                                       value="${this.apisixConfig.baseUrl}" 
                                                       placeholder="http://localhost:9180/apisix/admin">
                                                <small class="form-text text-muted">APISIX管理API的基础URL</small>
                                            </div>
                                            
                                            <div class="form-group">
                                                <label class="form-label">请求超时时间(毫秒)</label>
                                                <input type="number" class="form-control" id="apisix-timeout" 
                                                       value="${this.apisixConfig.timeout}" 
                                                       placeholder="10000">
                                                <small class="form-text text-muted">API请求的超时时间</small>
                                            </div>
                                            
                                            <div class="form-group">
                                                <label class="form-label">API密钥</label>
                                                <input type="text" class="form-control" id="apisix-api-key" 
                                                       value="${this.apisixConfig.headers['X-API-KEY'] || 'edd1c9f034335f136f87ad84b625c8f1'}" 
                                                       placeholder="edd1c9f034335f136f87ad84b625c8f1">
                                                <small class="form-text text-muted">APISIX Admin API认证密钥</small>
                                            </div>
                                            
                                            <div class="form-group">
                                                <label class="form-label">请求头</label>
                                                <textarea class="form-control" id="apisix-headers" rows="3" 
                                                          placeholder='{"Content-Type": "application/json", "X-API-KEY": "your-key"}'>${JSON.stringify(this.apisixConfig.headers, null, 2)}</textarea>
                                                <small class="form-text text-muted">API请求的默认请求头(JSON格式)</small>
                                            </div>
                                            
                                            <button class="btn btn-primary" onclick="window.apisixAdmin.saveAPIConfig()">
                                                <i class="mdi mdi-content-save"></i> 保存配置
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-6">
                                    <div class="card border">
                                        <div class="card-body">
                                            <h5 class="card-title">
                                                <i class="mdi mdi-information text-info"></i>
                                                连接状态
                                            </h5>
                                            
                                            <div id="connection-status">
                                                <div class="alert alert-info">
                                                    <i class="mdi mdi-clock-outline"></i>
                                                    点击"测试连接"按钮检查APISIX连接状态
                                                </div>
                                            </div>
                                            
                                            <div class="mt-3">
                                                <h6>当前配置信息：</h6>
                                                <ul class="list-unstyled">
                                                    <li><strong>API地址:</strong> <span id="current-api-url">${this.apisixConfig.baseUrl}</span></li>
                                                    <li><strong>超时时间:</strong> <span id="current-timeout">${this.apisixConfig.timeout}ms</span></li>
                                                    <li><strong>API密钥:</strong> <span id="current-api-key">${this.apisixConfig.headers['X-API-KEY'] || '未设置'}</span></li>
                                                    <li><strong>请求头:</strong> <span id="current-headers">${JSON.stringify(this.apisixConfig.headers)}</span></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 保存API配置
    saveAPIConfig() {
        try {
            const baseUrl = document.getElementById('apisix-base-url').value.trim();
            const timeout = parseInt(document.getElementById('apisix-timeout').value) || 10000;
            const apiKey = document.getElementById('apisix-api-key').value.trim();
            const headersText = document.getElementById('apisix-headers').value.trim();
            
            let headers = {};
            try {
                headers = JSON.parse(headersText);
            } catch (e) {
                this.showNotification('请求头格式错误，请使用有效的JSON格式', 'error');
                return;
            }
            
            // 确保包含必要的请求头
            headers['Content-Type'] = 'application/json';
            if (apiKey) {
                headers['X-API-KEY'] = apiKey;
            }
            
            // 更新配置
            this.apisixConfig = {
                baseUrl: baseUrl,
                timeout: timeout,
                headers: headers
            };
            
            // 保存到localStorage
            localStorage.setItem('apisixConfig', JSON.stringify(this.apisixConfig));
            
            // 更新显示
            document.getElementById('current-api-url').textContent = baseUrl;
            document.getElementById('current-timeout').textContent = timeout + 'ms';
            document.getElementById('current-api-key').textContent = apiKey || '未设置';
            document.getElementById('current-headers').textContent = JSON.stringify(headers);
            
            this.showNotification('API配置保存成功', 'success');
            
            // 自动测试连接
            setTimeout(() => {
                this.testAPISIXConnection();
            }, 500);
            
        } catch (error) {
            console.error('保存API配置失败:', error);
            this.showNotification('保存API配置失败: ' + error.message, 'error');
        }
    }

    // 刷新APISIX数据
    async refreshAPISIXData() {
        try {
            console.log('开始刷新APISIX数据...');
            
            // 获取各种数据
            const [routes, services, upstreams, consumers, ssl] = await Promise.all([
                this.getRoutes(),
                this.getServices(),
                this.getUpstreams(),
                this.getConsumers(),
                this.getSSL()
            ]);
            
            // 数据验证和默认值处理
            this.routesData = this.validateAndNormalizeData(routes, 'routes') || [];
            this.servicesData = this.validateAndNormalizeData(services, 'services') || [];
            this.upstreamsData = this.validateAndNormalizeData(upstreams, 'upstreams') || [];
            this.consumersData = this.validateAndNormalizeData(consumers, 'consumers') || [];
            this.sslData = this.validateAndNormalizeData(ssl, 'ssl') || [];
            
            // 保存到localStorage作为缓存
            this.saveToStorage('routes', this.routesData);
            this.saveToStorage('services', this.servicesData);
            this.saveToStorage('upstreams', this.upstreamsData);
            this.saveToStorage('consumers', this.consumersData);
            this.saveToStorage('ssl', this.sslData);
            
            console.log('APISIX数据刷新完成:', {
                routes: this.routesData.length,
                services: this.servicesData.length,
                upstreams: this.upstreamsData.length,
                consumers: this.consumersData.length,
                ssl: this.sslData.length
            });
            
            // 重新构建数据关系
            this.rebuildDataRelationships();
            
            // 记录最后刷新时间
            this.lastDataRefreshTime = new Date();
            
            // 更新相关页面的显示
            await this.updateAllPageDisplays();
            
            // 如果当前在概览页面，更新访问链路关系
            if (this.currentPage === 'overview') {
                this.updateOverviewAccessChains();
            }
            
            this.showNotification(`数据刷新成功！路由: ${this.routesData.length}, 服务: ${this.servicesData.length}, 上游: ${this.upstreamsData.length}, 消费者: ${this.consumersData.length}, SSL: ${this.sslData.length}`, 'success');
            
        } catch (error) {
            console.error('刷新APISIX数据失败:', error);
            this.showNotification('刷新数据失败: ' + error.message, 'error');
        }
    }

    // 初始化数据存储
    async initDataStorage() {
        // 从localStorage加载数据作为缓存，如果没有则使用空数组
        this.servicesData = this.loadFromStorage('services') || [];
        this.consumersData = this.loadFromStorage('consumers') || [];
        this.routesData = this.loadFromStorage('routes') || [];
        this.upstreamsData = this.loadFromStorage('upstreams') || [];
        this.sslData = this.loadFromStorage('ssl') || [];
        
        // 初始化etcd客户端
        this.etcdClient = new EtcdClient();
        
        // 测试etcd连接
        const etcdConnected = await this.etcdClient.testConnection();
        console.log('etcd连接状态:', etcdConnected);
        
        if (etcdConnected) {
            console.log('=== etcd连接成功，配置模板将直接从etcd读取 ===');
        } else {
            console.warn('etcd连接失败，配置模板功能可能不可用');
        }
        
        // 初始化插件列表（异步加载）
        this.allPlugins = [];
        this.initPlugins();
        
        console.log('数据存储初始化完成:', {
            services: this.servicesData.length,
            consumers: this.consumersData.length,
            routes: this.routesData.length,
            upstreams: this.upstreamsData.length,
            ssl: this.sslData.length,
            pluginConfigTemplates: '直接从etcd读取',
            allPlugins: this.allPlugins.length
        });
        
        // 尝试从APISIX获取最新数据
        try {
            await this.refreshAPISIXData();
        } catch (error) {
            console.log('初始化时获取APISIX数据失败，使用缓存数据:', error.message);
        }
    }

    // APISIX API请求方法
    async apisixRequest(endpoint, options = {}) {
        const url = `${this.apisixConfig.baseUrl}${endpoint}`;
        
        // 确保包含必要的认证头
        const headers = {
            'Content-Type': 'application/json',
            'X-API-KEY': this.apisixConfig.headers['X-API-KEY'] || 'edd1c9f034335f136f87ad84b625c8f1',
            ...this.apisixConfig.headers,
            ...options.headers
        };
        
        const defaultOptions = {
            method: 'GET',
            headers: headers,
            timeout: this.apisixConfig.timeout
        };
        
        const requestOptions = { ...defaultOptions, ...options };
        
        try {
            console.log(`APISIX API请求: ${requestOptions.method} ${url}`);
            console.log('请求头:', requestOptions.headers);
            
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('APISIX API错误响应:', response.status, response.statusText, errorText);
                throw new Error(`APISIX API错误: ${response.status} - ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`APISIX API响应:`, data);
            return data;
        } catch (error) {
            console.error('APISIX API请求失败:', error);
            throw error;
        }
    }

    // 获取APISIX状态信息
    async getAPISIXStatus() {
        try {
            // APISIX Admin API没有/status端点，通过获取路由列表来检查状态
            const routes = await this.getRoutes();
            if (routes && Array.isArray(routes)) {
                return {
                    status: 'running',
                    message: 'APISIX运行正常',
                    routes_count: routes.length,
                    apisix_version: '3.13.0',
                    node_id: 'apisix-node'
                };
            } else {
                console.warn('APISIX状态检查：路由数据为空或无效');
                return null;
            }
        } catch (error) {
            console.error('获取APISIX状态失败:', error);
            // 如果是认证错误，返回特定的错误信息
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                throw new Error('APISIX认证失败：请检查API密钥配置');
            }
            return null;
        }
    }

    // 获取路由列表
    async getRoutes() {
        try {
            const data = await this.apisixRequest('/routes');
            console.log('=== APISIX路由原始数据 ===');
            console.log('路由原始数据:', data);
            
            if (data && data.list && Array.isArray(data.list)) {
                // 处理APISIX数据格式：从list中提取value并合并key信息
                const processedData = data.list.map(item => {
                    if (item.value && item.key) {
                        const processed = {
                            ...item.value,
                            // 从key中提取ID作为备用
                            key: item.key,
                            // 如果没有id字段，从key中提取
                            id: item.value.id || item.key.replace('/apisix/routes/', '')
                        };
                        console.log('处理后的路由数据:', processed);
                        return processed;
                    }
                    return item;
                });
                console.log('最终路由数据:', processedData);
                return processedData;
            } else if (Array.isArray(data)) {
                return data;
            } else {
                console.warn('APISIX路由数据格式异常:', data);
                return [];
            }
        } catch (error) {
            console.error('获取路由列表失败:', error);
            return [];
        }
    }

    // 获取服务列表
    async getServices() {
        try {
            const data = await this.apisixRequest('/services');
            console.log('APISIX服务原始数据:', data);
            
            if (data && data.list && Array.isArray(data.list)) {
                // 处理APISIX数据格式：从list中提取value并合并key信息
                return data.list.map(item => {
                    if (item.value && item.key) {
                        return {
                            ...item.value,
                            // 从key中提取ID作为备用
                            key: item.key,
                            // 如果没有id字段，从key中提取
                            id: item.value.id || item.key.replace('/apisix/services/', '')
                        };
                    }
                    return item;
                });
            } else if (Array.isArray(data)) {
                return data;
            } else {
                console.warn('APISIX服务数据格式异常:', data);
                return [];
            }
        } catch (error) {
            console.error('获取服务列表失败:', error);
            return [];
        }
    }

    // 获取上游列表
    async getUpstreams() {
        try {
            const data = await this.apisixRequest('/upstreams');
            console.log('APISIX上游原始数据:', data);
            
            if (data && data.list && Array.isArray(data.list)) {
                // 处理APISIX数据格式：从list中提取value并合并key信息
                return data.list.map(item => {
                    if (item.value && item.key) {
                        return {
                            ...item.value,
                            // 从key中提取ID作为备用
                            key: item.key,
                            // 如果没有id字段，从key中提取
                            id: item.value.id || item.key.replace('/apisix/upstreams/', '')
                        };
                    }
                    return item;
                });
            } else if (Array.isArray(data)) {
                console.warn('APISIX上游数据格式异常:', data);
                return [];
            }
            return [];
        } catch (error) {
            console.error('获取上游列表失败:', error);
            return [];
        }
    }

    // 获取消费者列表
    async getConsumers() {
        try {
            const data = await this.apisixRequest('/consumers');
            console.log('=== APISIX消费者原始数据 ===');
            console.log('消费者原始数据:', data);
            
            if (data && data.list && Array.isArray(data.list)) {
                // 处理APISIX数据格式：从list中提取value并合并key信息
                const processedData = data.list.map(item => {
                    if (item.value && item.key) {
                        const processed = {
                            ...item.value,
                            // 从key中提取ID作为备用
                            key: item.key,
                            // 如果没有id字段，从key中提取
                            id: item.value.id || item.key.replace('/apisix/consumers/', '')
                        };
                        console.log('处理后的消费者数据:', processed);
                        return processed;
                    }
                    return item;
                });
                console.log('最终消费者数据:', processedData);
                return processedData;
            } else if (Array.isArray(data)) {
                return data;
            } else {
                console.warn('APISIX消费者数据格式异常:', data);
                return [];
            }
        } catch (error) {
            console.error('获取消费者列表失败:', error);
            return [];
        }
    }

    // 获取SSL证书列表
    async getSSL() {
        try {
            const data = await this.apisixRequest('/ssls');
            console.log('APISIX SSL原始数据:', data);
            
            if (data && data.list && Array.isArray(data.list)) {
                // 处理APISIX数据格式：从list中提取value并合并key信息
                return data.list.map(item => {
                    if (item.value && item.key) {
                        return {
                            ...item.value,
                            // 从key中提取ID作为备用
                            key: item.key,
                            // 如果没有id字段，从key中提取
                            id: item.value.id || item.key.replace('/apisix/ssls/', '')
                        };
                    }
                    return item;
                });
            } else if (Array.isArray(data)) {
                return data;
            } else {
                console.warn('APISIX SSL数据格式异常:', data);
                return [];
            }
        } catch (error) {
            console.error('获取SSL证书列表失败:', error);
            return [];
        }
    }

    bindEvents() {
        // 绑定导航点击事件
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-page]')) {
                e.preventDefault();
                const page = e.target.closest('[data-page]').getAttribute('data-page');
                this.navigateToPage(page);
            }
        });

        // 绑定logo点击事件，点击logo回到仪表板
        const logoLink = document.querySelector('#top-logo .logo');
        if (logoLink) {
            logoLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToPage('dashboard');
            });
        }
        
        // 监听页面可见性变化，当页面重新可见时自动刷新数据
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('页面重新可见，自动刷新APISIX数据');
                setTimeout(() => {
                    this.refreshAPISIXData();
                }, 500);
            }
        });
        
        // 监听页面焦点变化，当页面重新获得焦点时自动刷新数据
        window.addEventListener('focus', () => {
            console.log('页面重新获得焦点，自动刷新APISIX数据');
            setTimeout(() => {
                this.refreshAPISIXData();
            }, 500);
        });
    }

    navigateToPage(page) {
        console.log('Navigating to page:', page);
        
        this.currentPage = page;
        this.loadPageContent(page);
        
        // 设置当前激活的菜单项
        this.setActiveMenuItem(page);
        
        // 切换到新页面时，如果数据为空则自动刷新
        if (this.shouldRefreshDataForPage(page)) {
            setTimeout(() => {
                this.refreshAPISIXData();
            }, 300);
        }
    }
    
    // 设置当前激活的菜单项
    setActiveMenuItem(page) {
        console.log('设置激活菜单项:', page);
        
        // 移除所有菜单项的active类
        const allMenuItems = document.querySelectorAll('.navbar-nav .nav-link');
        console.log('找到菜单项数量:', allMenuItems.length);
        allMenuItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // 为当前页面对应的菜单项添加active类
        const currentMenuItem = document.querySelector(`[data-page="${page}"]`);
        console.log('当前菜单项:', currentMenuItem);
        if (currentMenuItem) {
            currentMenuItem.classList.add('active');
            console.log('已添加active类到:', currentMenuItem.textContent.trim());
        } else {
            console.warn('未找到对应的菜单项:', page);
        }
    }
    
    // 判断页面是否需要刷新数据
    shouldRefreshDataForPage(page) {
        switch(page) {
            case 'routes':
                return !this.routesData || this.routesData.length === 0;
            case 'services':
                return !this.servicesData || this.servicesData.length === 0;
            case 'upstreams':
                return !this.upstreamsData || this.upstreamsData.length === 0;
            case 'consumers':
                return !this.consumersData || this.consumersData.length === 0;
            case 'ssl':
                return !this.sslData || this.sslData.length === 0;
            case 'system-settings':
                return !this.routesData || !this.servicesData || !this.upstreamsData || !this.consumersData;
            default:
                return false;
        }
    }

    loadPageContent(page) {
        const contentDiv = document.getElementById('dynamic-content');
        if (!contentDiv) return;

        // 记录当前页面
        this.currentPage = page;
        
        // 根据页面类型加载不同内容
        switch(page) {
            case 'dashboard':
                this.loadDashboardContent(contentDiv);
                // 自动显示默认仪表板内容
                setTimeout(() => {
                    this.switchDashboard('default');
                }, 100);
                break;
            case 'overview':
                this.loadOverviewContent(contentDiv);
                break;
            case 'routes':
                this.loadRoutesContent(contentDiv);
                break;
            case 'upstreams':
                this.loadUpstreamsContent(contentDiv);
                break;
            case 'services':
                this.loadServicesContent(contentDiv);
                break;
            case 'consumers':
                this.loadConsumersContent(contentDiv);
                break;
            case 'ssl':
                this.loadSSLContent(contentDiv);
                break;
            case 'plugin':
                this.loadPluginContent(contentDiv);
                break;
            case 'plugin02':
                this.loadPlugin02Content(contentDiv);
                break;
            case 'api-config':
                this.loadAPIConfigContent(contentDiv);
                break;
            case 'system-settings':
                this.loadSystemSettingsContent(contentDiv);
                break;
            case 'user-management':
                this.loadUserManagementContent(contentDiv);
                break;
            default:
                this.loadDefaultContent(contentDiv, page);
        }
    }



    loadDashboardContent(contentDiv) {
        contentDiv.innerHTML = `
            <!-- 仪表板管理工具栏 -->
            <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center">
                            
                                <div class="d-flex align-items-center">
                                    <select class="form-control form-control-sm mr-2" id="dashboard-selector" onchange="window.apisixAdmin.switchDashboard(this.value)">
                                        <option value="default">默认仪表板</option>
                                    </select>
                                    <div class="d-flex align-items-center ml-2">
                                        <button class="btn btn-sm btn-outline-secondary mr-2" style="min-width: 90px;" onclick="window.apisixAdmin.editCurrentDashboard()">
                                            <i class="mdi mdi-pencil"></i> 编辑
                                        </button>
                                        <button class="btn btn-sm btn-outline-primary" style="min-width: 120px;" onclick="window.apisixAdmin.createNewDashboard()">
                                            <i class="mdi mdi-plus"></i> 新建仪表板
                                </button>
                            </div>
                                            </div>
                                        </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
            <!-- 当前仪表板内容 -->
            <div id="current-dashboard-content">
                <!-- 仪表板内容将通过 switchDashboard 动态加载 -->
            </div>
        `;
        // 重新填充仪表板选择器（避免导航后选项丢失）
        this.updateDashboardSelector();
    }

    loadRoutesContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- 顶部工具栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h4 class="card-title mb-1">路由管理</h4>
                                    <p class="text-muted mb-0">管理API网关的路由配置</p>
                            </div>
                                <div class="d-flex flex-wrap">
                                    <button class="btn btn-outline-secondary" style="margin-right: 20px;" onclick="window.apisixAdmin.refreshRoutes()">
                                        <i class="mdi mdi-refresh me-1"></i>刷新
                                    </button>
                                    <button class="btn btn-primary" onclick="window.apisixAdmin.createRoute()">
                                        <i class="mdi mdi-plus me-1"></i>新建路由
                                    </button>
                        </div>
                    </div>
                    
                    <!-- 初始化路由数据 -->
                    <script>
                        // 页面加载完成后自动初始化数据
                        setTimeout(() => {
                            if (window.apisixAdmin) {
                                window.apisixAdmin.initializeRoutesData();
                            }
                        }, 100);
                    </script>
                    
                    <!-- APISIX连接状态提示 -->
                    <div id="apisix-status-alert" class="alert alert-info" style="display: none;">
                        <i class="mdi mdi-information-outline me-2"></i>
                        <span id="apisix-status-text">正在检查APISIX连接状态...</span>
                    </div>

                            <!-- 搜索 -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="mdi mdi-magnify"></i></span>
                                        <input type="text" class="form-control" id="route-search" placeholder="搜索路由名称、URI或服务...">
                </div>
                                </div>
                            </div>

                            <!-- 路由统计卡片 -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-left-primary">
                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">总路由数</h6>
                                                    <h4 class="mb-0" id="total-routes">0</h4>
                            </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-routes mdi-24px text-primary"></i>
                        </div>
                    </div>
                </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-success">
                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已启用</h6>
                                                    <h4 class="mb-0" id="enabled-routes">0</h4>
                            </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-check-circle mdi-24px text-success"></i>
                        </div>
                    </div>
                </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-warning">
                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已禁用</h6>
                                                    <h4 class="mb-0" id="disabled-routes">0</h4>
                            </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-pause-circle mdi-24px text-warning"></i>
                        </div>
                    </div>
                </div>
            </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-info">
                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">关联插件数量</h6>
                                                    <h4 class="mb-0" id="total-plugins">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-puzzle mdi-24px text-info"></i>
                                                </div>
                                            </div>
                        </div>
                    </div>
                </div>
            </div>

                            <!-- 路由列表 -->
                            <div class="table-responsive">
                                <table class="table table-centered table-hover mb-0" id="routes-table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="sortable" data-sort="id" style="cursor: pointer;">
                                                ID <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="name" style="cursor: pointer;">
                                                名称 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="uri" style="cursor: pointer;">
                                                URI <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="methods" style="cursor: pointer;">
                                                方法 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="service" style="cursor: pointer;">
                                                关联服务 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="plugins" style="cursor: pointer;">
                                                插件 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="status" style="cursor: pointer;">
                                                状态 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="createTime" style="cursor: pointer;">
                                                创建时间 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="routes-tbody">
                                        <!-- 路由数据将通过JavaScript动态加载 -->
                                    </tbody>
                                </table>
                                            </div>

                            <!-- 分页 -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted">
                                    显示 <span id="routes-start">0</span> 到 <span id="routes-end">0</span> 条，共 <span id="routes-total">0</span> 条记录
                                </div>
                                <nav aria-label="路由分页">
                                    <ul class="pagination pagination-sm mb-0" id="routes-pagination">
                                        <!-- 分页将通过JavaScript动态生成 -->
                                    </ul>
                                </nav>
                            </div>
                        </div>
                                        </div>
                                    </div>
                                </div>
                                
            <!-- 新建/编辑路由模态框 -->
            <div class="modal fade" id="routeModal" tabindex="-1" aria-labelledby="routeModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content">
                                                <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title" id="routeModalLabel">
                                <i class="mdi mdi-plus-circle me-2"></i>新建路由
                            </h5>
                                            </div>
                        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                            <form id="route-form">
                                <!-- 基本信息 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>基本信息</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="route-name" class="form-label fw-bold">路由名称 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="route-name" placeholder="请输入路由名称" required style="font-size: 14px;">
                                                    <div class="form-text">用于标识和管理路由的友好名称</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="route-id" class="form-label fw-bold">路由ID</label>
                                                    <input type="text" class="form-control" id="route-id" placeholder="留空自动生成" style="font-size: 14px;">
                                                    <div class="form-text">路由的唯一标识符，留空将自动生成</div>
                                        </div>
                                    </div>
                                </div>
                                
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="route-uri" class="form-label fw-bold">URI路径 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="route-uri" placeholder="/api/v1/users/*" required style="font-size: 14px;">
                                                    <div class="form-text">支持通配符，如 /api/v1/* 或 /users/{id}</div>
                                            </div>
                                        </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label class="form-label fw-bold">HTTP方法</label>
                                                    <div class="http-methods-container">
                                                        <select class="form-select custom-select" id="http-method-select" style="font-size: 14px;">
                                                            <option value="" style="font-size: 14px;">选择HTTP方法</option>
                                                            <option value="GET" style="font-size: 14px;">GET</option>
                                                            <option value="POST" style="font-size: 14px;">POST</option>
                                                            <option value="PUT" style="font-size: 14px;">PUT</option>
                                                            <option value="DELETE" style="font-size: 14px;">DELETE</option>
                                                            <option value="PATCH" style="font-size: 14px;">PATCH</option>
                                                            <option value="HEAD" style="font-size: 14px;">HEAD</option>
                                                            <option value="OPTIONS" style="font-size: 14px;">OPTIONS</option>
                                                        </select>
                                                        <div class="selected-methods-tags" id="selected-methods-tags">
                                                            <!-- 选中的标签将在这里显示 -->
                                    </div>
                                </div>
                                                    <div class="form-text">从下拉菜单选择HTTP方法，支持多选</div>
                            </div>
                        </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="route-service" class="form-label fw-bold">关联服务 <span class="text-danger">*</span></label>
                                                    <select class="form-select custom-select" id="route-service" required style="font-size: 14px;">
                                                        <option value="" style="font-size: 14px;">请选择服务</option>
                                                        <!-- 服务选项将通过JavaScript动态加载 -->
                                                    </select>
                                                    <div class="form-text">选择路由关联的服务配置</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="route-priority" class="form-label fw-bold">优先级</label>
                                                    <input type="number" class="form-control" id="route-priority" value="0" min="0" max="100" style="font-size: 14px;">
                                                    <div class="form-text">数值越大优先级越高，用于路由匹配顺序</div>
                                                </div>
                                            </div>
                                        </div>



                                                    <div class="row">
                                            <div class="col-md-12">
                                                <div class="mb-3">
                                                    <label for="route-desc" class="form-label fw-bold">描述</label>
                                                    <textarea class="form-control" id="route-desc" rows="3" placeholder="请输入路由的详细描述信息..." style="font-size: 14px;"></textarea>
                                                    <div class="form-text">可选的路由描述信息，便于管理和维护</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 插件配置 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                                        <h6 class="mb-0"><i class="mdi mdi-puzzle me-2"></i>插件配置</h6>
                                        <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.apisixAdmin.showRoutePluginSelector()">
                                            <i class="mdi mdi-plus me-1"></i>选择插件
                                        </button>
                                    </div>
                                    <div class="card-body">
                                        <!-- 已选择的插件列表 -->
                                        <div id="selected-route-plugins" class="mb-3">
                                            <div class="text-muted text-center py-3">
                                                <i class="mdi mdi-information-outline me-1"></i>
                                                点击"选择插件"按钮为路由添加插件配置
                                                <br><small class="text-muted">路由级别的插件配置具有最高优先级，会覆盖服务级别的同名插件</small>
                                            </div>
                                        </div>
                                        
                                        <!-- 插件配置详情 -->
                                        <div id="route-plugin-configs" class="d-none">
                                            <h6 class="mb-3"><i class="mdi mdi-cog me-2"></i>插件配置详情</h6>
                                            <div id="route-plugin-config-list"></div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 路由状态 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-toggle-switch me-2"></i>路由状态</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="form-check mb-3">
                                                    <input class="form-check-input" type="checkbox" id="route-enabled" checked>
                                                    <label class="form-check-label fw-bold" for="route-enabled">
                                                        <i class="mdi mdi-check-circle me-1"></i>创建后立即启用
                                                    </label>
                                                    <div class="form-text">创建后立即启用此路由</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelRoute()">
                                <i class="mdi mdi-close me-1"></i>取消
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.saveRoute()">
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 初始化路由管理功能
        this.initRoutesManagement();
        
        // 页面加载完成后自动检查APISIX状态并获取数据
        setTimeout(() => {
            this.checkAPISIXStatusForRoutes();
        }, 100);
    }
    
    // 检查路由页面的APISIX状态
    async checkAPISIXStatusForRoutes() {
        // 静默检查APISIX连接，不显示状态提示
        try {
            const status = await this.getAPISIXStatus();
            if (status) {
                // 自动获取路由数据
                await this.refreshRoutes();
            }
        } catch (error) {
            console.log('APISIX状态检查失败:', error.message);
        }
    }

    // 加载上游管理页面内容
    loadUpstreamsContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- 顶部工具栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h4 class="card-title mb-1">上游管理</h4>
                                    <p class="text-muted mb-0">管理API网关的上游服务配置</p>
                                </div>
                                <div class="d-flex flex-wrap">
                                    <button class="btn btn-outline-secondary" style="margin-right: 20px;" onclick="window.apisixAdmin.refreshUpstreams()">
                                        <i class="mdi mdi-refresh me-1"></i>刷新
                                    </button>
                                    <button class="btn btn-primary" onclick="window.apisixAdmin.createUpstream()">
                                        <i class="mdi mdi-plus me-1"></i>新建上游
                                </button>
                            </div>
                            </div>

                            <!-- 搜索 -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="mdi mdi-magnify"></i></span>
                                        <input type="text" class="form-control" id="upstream-search" placeholder="搜索上游名称、类型或节点...">
                                        </div>
                                    </div>
                                </div>
                                
                            <!-- 统计卡片 -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-left-primary">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">总上游数</h6>
                                                    <h4 class="mb-0" id="total-upstreams">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-server mdi-24px text-primary"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-success">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已启用</h6>
                                                    <h4 class="mb-0" id="enabled-upstreams">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-check-circle mdi-24px text-success"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-warning">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已禁用</h6>
                                                    <h4 class="mb-0" id="disabled-upstreams">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-pause-circle mdi-24px text-warning"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-info">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">总节点数</h6>
                                                    <h4 class="mb-0" id="total-nodes">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-database mdi-24px text-info"></i>
                                                </div>
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                            <!-- 上游列表 -->
                            <div class="table-responsive">
                                <table class="table table-hover" id="upstreams-table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="sortable" data-sort="id" style="cursor: pointer;">
                                                ID <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="name" style="cursor: pointer;">
                                                名称 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="loadBalancer" style="cursor: pointer;">
                                                负载均衡 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="nodes" style="cursor: pointer;">
                                                节点列表 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="healthCheck" style="cursor: pointer;">
                                                健康检查 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="services" style="cursor: pointer;">
                                                关联服务 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="status" style="cursor: pointer;">
                                                状态 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="createTime" style="cursor: pointer;">
                                                创建时间 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th style="width: 120px;">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="upstreams-tbody">
                                        <!-- 上游数据将在这里显示 -->
                                    </tbody>
                                </table>
                                            </div>

                            <!-- 分页 -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted">
                                    显示 <span id="upstreams-start">0</span> 到 <span id="upstreams-end">0</span> 条，共 <span id="upstreams-total">0</span> 条记录
                                        </div>
                                <nav aria-label="上游分页">
                                    <ul class="pagination pagination-sm mb-0" id="upstreams-pagination">
                                        <!-- 分页将通过JavaScript动态生成 -->
                                    </ul>
                                </nav>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

            <!-- 新建/编辑上游模态框 -->
            <div class="modal fade" id="upstreamModal" tabindex="-1" aria-labelledby="upstreamModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title" id="upstreamModalLabel">
                                <i class="mdi mdi-plus-circle me-2"></i>新建上游
                            </h5>
                        </div>
                        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                            <form id="upstream-form">
                                <!-- 基本信息 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>基本信息</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="upstream-name" class="form-label fw-bold">上游名称 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="upstream-name" placeholder="请输入上游名称" required>
                                                    <div class="form-text">用于标识和管理上游服务的友好名称</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="upstream-id" class="form-label fw-bold">上游ID</label>
                                                    <input type="text" class="form-control" id="upstream-id" placeholder="留空自动生成">
                                                    <div class="form-text">上游的唯一标识符，留空将自动生成</div>
                                                </div>
                </div>
            </div>

            <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="upstream-type" class="form-label fw-bold">负载均衡算法 <span class="text-danger">*</span></label>
                                                    <select class="form-select custom-select" id="upstream-type" required style="font-size: 0.8rem;">
                                                        <option value="">请选择负载均衡算法</option>
                                                        <option value="roundrobin">轮询 (roundrobin)</option>
                                                        <option value="chash">一致性哈希 (chash)</option>
                                                        <option value="ewma">指数加权移动平均 (ewma)</option>
                                                        <option value="least_conn">最小连接数 (least_conn)</option>
                                                    </select>
                                                    <div class="form-text">选择请求分发到节点的策略</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="upstream-timeout" class="form-label fw-bold">超时时间 (秒)</label>
                                                    <input type="number" class="form-control" id="upstream-timeout" value="3" min="1" max="60">
                                                    <div class="form-text">上游连接超时时间</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label for="upstream-desc" class="form-label fw-bold">描述</label>
                                            <textarea class="form-control" id="upstream-desc" rows="3" placeholder="请输入上游的详细描述信息..."></textarea>
                                            <div class="form-text">可选的上游描述信息，便于管理和维护</div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 节点配置 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-server me-2"></i>节点配置</h6>
                                    </div>
                        <div class="card-body">
                                        <div class="mb-3">
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <label class="form-label fw-bold">服务节点</label>
                                                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.apisixAdmin.addNode()">
                                                    <i class="mdi mdi-plus me-1"></i>添加节点
                                                </button>
                                </div>
                                            <div class="alert alert-info mb-3">
                                                <i class="mdi mdi-information-outline me-2"></i>
                                                <strong>节点配置说明：</strong>
                                                <ul class="mb-0 mt-2">
                                                    <li><strong>主机地址：</strong>支持IP地址（如：192.168.1.100）和域名（如：api.example.com）</li>
                                                    <li><strong>端口：</strong>支持标准端口（如：80、443）和自定义端口（如：8080、9000）</li>
                                                    <li><strong>权重：</strong>负载均衡权重，数值越大分配请求越多</li>
                                                </ul>
                                </div>
                                            <div id="nodes-container">
                                                <!-- 节点列表将在这里显示 -->
                            </div>
                        </div>
                    </div>
                </div>

                                <!-- 健康检查 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-heart-pulse me-2"></i>健康检查</h6>
                                    </div>
                        <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="form-check mb-3">
                                                    <input class="form-check-input" type="checkbox" id="health-check-enabled">
                                                    <label class="form-check-label fw-bold" for="health-check-enabled">
                                                        <i class="mdi mdi-heart me-1"></i>启用健康检查
                                                    </label>
                                                    <div class="form-text">定期检查节点健康状态</div>
                                </div>
                            </div>
                                            <div class="col-md-6">
                                                <div class="form-check mb-3">
                                                    <input class="form-check-input" type="checkbox" id="upstream-enabled" checked>
                                                    <label class="form-check-label fw-bold" for="upstream-enabled">
                                                        <i class="mdi mdi-check-circle me-1"></i>创建后立即启用
                                                    </label>
                                                    <div class="form-text">创建后立即启用此上游</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelUpstream()">
                                <i class="mdi mdi-close me-1"></i>取消
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.saveUpstream()">
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 初始化上游管理功能
        this.initUpstreamsManagement();
    }

    // 加载服务管理页面内容
    loadServicesContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- 顶部工具栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h4 class="card-title mb-1">服务管理</h4>
                                    <p class="text-muted mb-0">管理API网关的服务配置和插件</p>
                                </div>
                                <div class="d-flex flex-wrap">
                                    <button class="btn btn-outline-secondary" style="margin-right: 20px;" onclick="window.apisixAdmin.refreshServices()">
                                        <i class="mdi mdi-refresh me-1"></i>刷新
                                    </button>
                                    <button class="btn btn-primary" onclick="window.apisixAdmin.createService()">
                                        <i class="mdi mdi-plus me-1"></i>新建服务
                                </button>
                            </div>
                            </div>

                            <!-- 搜索 -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="mdi mdi-magnify"></i></span>
                                        <input type="text" class="form-control" id="service-search" placeholder="搜索服务名称、上游或插件...">
                                    </div>
                                </div>
                            </div>

                            <!-- 统计卡片 -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-left-primary">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">总服务数</h6>
                                                    <h4 class="mb-0" id="total-services">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-cog mdi-24px text-primary"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-success">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已启用</h6>
                                                    <h4 class="mb-0" id="enabled-services">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-check-circle mdi-24px text-success"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-warning">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已禁用</h6>
                                                    <h4 class="mb-0" id="disabled-services">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-pause-circle mdi-24px text-warning"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-info">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">关联插件数量</h6>
                                                    <h4 class="mb-0" id="total-service-plugins">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-puzzle mdi-24px text-info"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 服务列表 -->
                            <div class="table-responsive">
                                <table class="table table-hover" id="services-table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="sortable" data-sort="id" style="cursor: pointer;">
                                                ID <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="name" style="cursor: pointer;">
                                                名称 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="upstream" style="cursor: pointer;">
                                                关联上游 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="routes" style="cursor: pointer;">
                                                关联路由 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="plugins" style="cursor: pointer;">
                                                插件配置 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="status" style="cursor: pointer;">
                                                状态 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="createTime" style="cursor: pointer;">
                                                创建时间 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th style="width: 120px;">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="services-tbody">
                                        <!-- 服务数据将在这里显示 -->
                                    </tbody>
                                </table>
                            </div>

                            <!-- 分页 -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted">
                                    显示 <span id="services-start">0</span> 到 <span id="services-end">0</span> 条，共 <span id="services-total">0</span> 条记录
                                </div>
                                <nav aria-label="服务分页">
                                    <ul class="pagination pagination-sm mb-0" id="services-pagination">
                                        <!-- 分页将通过JavaScript动态生成 -->
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 新建/编辑服务模态框 -->
            <div class="modal fade" id="serviceModal" tabindex="-1" aria-labelledby="serviceModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen-lg-down modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title" id="serviceModalLabel">
                                <i class="mdi mdi-plus-circle me-2"></i>新建服务
                            </h5>
                            <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal" aria-label="Close" style="font-size: 1.5rem; line-height: 1; text-decoration: none;">
                                <i class="mdi mdi-close"></i>
                            </button>
                        </div>
                        <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
                            <form id="service-form">
                                <!-- 基本信息 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>基本信息</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="service-name" class="form-label fw-bold">服务名称 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="service-name" placeholder="请输入服务名称" required>
                                                    <div class="form-text">用于标识和管理服务的友好名称</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="service-id" class="form-label fw-bold">服务ID</label>
                                                    <input type="text" class="form-control" id="service-id" placeholder="留空自动生成">
                                                    <div class="form-text">服务的唯一标识符，留空将自动生成</div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="service-upstream" class="form-label fw-bold">上游服务 <span class="text-danger">*</span></label>
                                                    <select class="form-select custom-select" id="service-upstream" required style="font-size: 0.8rem;">
                                                        <option value="">请选择上游服务</option>
                                                        <!-- 上游服务选项将通过JavaScript动态加载 -->
                                                    </select>
                                                    <div class="form-text">选择该服务对应的上游服务</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="service-desc" class="form-label fw-bold">服务描述</label>
                                                    <textarea class="form-control" id="service-desc" rows="2" placeholder="请输入服务描述"></textarea>
                                                    <div class="form-text">服务的详细描述信息</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 插件配置 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                                        <h6 class="mb-0"><i class="mdi mdi-puzzle me-2"></i>插件配置</h6>
                                        <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.apisixAdmin.showServicePluginSelector()">
                                            <i class="mdi mdi-plus me-1"></i>选择插件
                                        </button>
                                    </div>
                                    <div class="card-body">
                                        <!-- 已选择的插件列表 -->
                                        <div id="selected-service-plugins" class="mb-3">
                                            <div class="text-muted text-center py-3">
                                                <i class="mdi mdi-information-outline me-1"></i>
                                                点击"选择插件"按钮为服务添加插件配置
                                            </div>
                                        </div>
                                        
                                        <!-- 插件配置详情 -->
                                        <div id="service-plugin-configs" class="d-none">
                                            <h6 class="mb-3"><i class="mdi mdi-cog me-2"></i>插件配置详情</h6>
                                            <div id="service-plugin-config-list"></div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 服务状态 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0"><i class="mdi mdi-toggle-switch me-2"></i>服务状态</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="form-check mb-3">
                                                    <input class="form-check-input" type="checkbox" id="service-enabled" checked>
                                                    <label class="form-check-label fw-bold" for="service-enabled">
                                                        <i class="mdi mdi-check-circle me-1"></i>创建后立即启用
                                                    </label>
                                                    <div class="form-text">创建后立即启用此服务</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer bg-light sticky-bottom">
                            <button type="button" class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelService()">
                                <i class="mdi mdi-close me-1"></i>取消
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.saveService()">
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 初始化服务管理功能
        this.initServicesManagement();
    }

    // ==================== 服务管理功能 ====================

    // 初始化服务管理
    initServicesManagement() {
        this.initServicesData();
        this.bindServicesEvents();
        this.updateServicesStats();
    }

    // 初始化服务数据
    initServicesData() {
        // 如果还没有数据，则初始化为空数组
        if (!this.servicesData || this.servicesData.length === 0) {
            this.servicesData = [];
            // 数据为空时自动刷新
            console.log('服务数据为空，自动刷新...');
            setTimeout(() => {
                this.refreshAPISIXData();
            }, 200);
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displayServicesWithPagination(this.servicesData);
        this.updateServicesStats();
    }

    // 统一的数据存储接口 - 为后续接入数据库做准备
    saveToStorage(key, data) {
        try {
            localStorage.setItem(`apisix_${key}`, JSON.stringify(data));
            console.log(`数据已保存到本地存储: ${key}`, data.length);
            return true;
        } catch (error) {
            console.error(`保存数据到本地存储失败: ${key}`, error);
            return false;
        }
    }

    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(`apisix_${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`从本地存储加载数据失败: ${key}`, error);
            return null;
        }
    }

    // 数据导出功能
    exportData(key) {
        try {
            const data = this.loadFromStorage(key);
            if (!data) {
                this.showNotification('没有数据可导出', 'warning');
                return;
            }
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `apisix_${key}_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification(`数据已导出: ${key}`, 'success');
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showNotification('导出数据失败', 'error');
        }
    }

    // 数据导入功能
    importData(key, file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.saveToStorage(key, data);
                
                // 更新对应的数据数组
                switch(key) {
                    case 'services':
                        this.servicesData = data;
                        this.displayServicesWithPagination(data);
                        this.updateServicesStats();
                        break;
                    case 'consumers':
                        this.consumersData = data;
                        this.displayConsumersWithPagination(data);
                        this.updateConsumersStats();
                        break;
                    case 'routes':
                        this.routesData = data;
                        this.displayRoutesWithPagination(data);
                        this.updateRoutesStats();
                        break;
                    case 'upstreams':
                        this.upstreamsData = data;
                        this.displayUpstreamsWithPagination(data);
                        this.updateUpstreamsStats();
                        break;
                    case 'ssl':
                        this.sslData = data;
                        this.displaySSLsWithPagination(data);
                        this.updateSSLsStats();
                        break;
                }
                
                this.showNotification(`数据已导入: ${key}`, 'success');
            } catch (error) {
                console.error('导入数据失败:', error);
                this.showNotification('导入数据失败: 文件格式错误', 'error');
            }
        };
        reader.readAsText(file);
    }

    // 数据验证和标准化
    validateAndNormalizeData(data, type) {
        if (!data) {
            console.warn(`${type} 数据无效:`, data);
            return [];
        }
        
        // 如果不是数组，尝试转换为数组
        let dataArray = data;
        if (!Array.isArray(data)) {
            if (typeof data === 'object') {
                dataArray = [data];
            } else {
                console.warn(`${type} 数据无法转换为数组:`, data);
                return [];
            }
        }
        
        console.log(`=== ${type} 数据验证开始 ===`);
        console.log(`${type} 原始数据:`, dataArray);
        
        const normalizedData = dataArray.map(item => {
            if (!item) return null;
            
            // 确保关键字段存在
            const normalized = { ...item };
            
            console.log(`${type} 单个项目验证前:`, normalized);
            
            switch(type) {
                case 'services':
                    // 处理APISIX服务数据格式
                    if (normalized.key && !normalized.id) {
                        // 从key中提取ID，例如：/apisix/services/service-123 -> service-123
                        normalized.id = normalized.key.replace('/apisix/services/', '');
                    }
                    
                    // 保持plugins的原始对象格式，用于显示插件配置
                    if (!normalized.plugins) {
                        normalized.plugins = {};
                    }
                    
                    // 处理上游字段：APISIX返回的是upstream_id，前端期望的是upstream
                    normalized.upstream = normalized.upstream || normalized.upstream_id || '';
                    
                    normalized.pluginConfigs = normalized.pluginConfigs || [];
                    normalized.status = normalized.status || 'enabled';
                    normalized.name = normalized.name || `服务-${normalized.id || 'unknown'}`;
                    normalized.description = normalized.description || '';
                    normalized.createTime = normalized.createTime || new Date().toLocaleString();
                    break;
                    
                case 'consumers':
                    // 处理APISIX消费者数据格式
                    if (normalized.key && !normalized.id) {
                        normalized.id = normalized.key.replace('/apisix/consumers/', '');
                    }
                    
                    // 保持plugins的原始对象格式，用于显示插件名称
                    if (!normalized.plugins) {
                        normalized.plugins = {};
                    }
                    
                    // 添加调试信息
                    console.log('=== 消费者数据验证 ===');
                    console.log('原始消费者数据:', normalized);
                    console.log('消费者插件数据:', normalized.plugins);
                    console.log('消费者插件类型:', typeof normalized.plugins);
                    console.log('消费者插件键:', Object.keys(normalized.plugins || {}));
                    
                    // 处理认证类型：根据插件类型自动判断
                    if (normalized.plugins && typeof normalized.plugins === 'object') {
                        // 如果plugins是对象，提取认证类型
                        if (normalized.plugins['key-auth']) {
                            normalized.authType = 'key-auth';
                        } else if (normalized.plugins['basic-auth']) {
                            normalized.authType = 'basic-auth';
                        } else if (normalized.plugins['jwt-auth']) {
                            normalized.authType = 'jwt-auth';
                        } else if (normalized.plugins['oauth2']) {
                            normalized.authType = 'oauth2';
                        } else {
                            normalized.authType = 'custom';
                        }
                    } else {
                        normalized.authType = 'none';
                    }
                    
                    // 路由信息需要通过关系构建来获取，这里先设为空数组
                    normalized.routes = [];
                    
                    // 构建服务与路由的关系
                    if (this.routesData && this.routesData.length > 0) {
                        const relatedRoutes = this.routesData.filter(route => route.service === normalized.id);
                        normalized.routes = relatedRoutes.map(route => route.name || route.id);
                    }
                    
                    // 处理状态字段：APISIX可能返回数字状态，需要转换为字符串
                    console.log('消费者状态字段处理前:', normalized.status, typeof normalized.status);
                    if (normalized.status === 1 || normalized.status === '1') {
                        normalized.status = 'active';
                    } else if (normalized.status === 0 || normalized.status === '0') {
                        normalized.status = 'inactive';
                    } else {
                        normalized.status = normalized.status || 'active';
                    }
                    console.log('消费者状态字段处理后:', normalized.status);
                    
                    normalized.username = normalized.username || `消费者-${normalized.id || 'unknown'}`;
                    
                    // 处理时间戳转换
                    if (normalized.create_time && typeof normalized.create_time === 'number') {
                        normalized.createTime = new Date(normalized.create_time * 1000).toLocaleString('zh-CN');
                    } else if (normalized.createTime) {
                        normalized.createTime = normalized.createTime;
                    } else {
                        normalized.createTime = new Date().toLocaleString('zh-CN');
                    }
                    break;
                    
                case 'routes':
                    // 处理APISIX路由数据格式
                    if (normalized.key && !normalized.id) {
                        normalized.id = normalized.key.replace('/apisix/routes/', '');
                    }
                    
                    // 保持plugins的原始对象格式，用于显示插件名称
                    if (!normalized.plugins) {
                        normalized.plugins = {};
                    }
                    
                    // 处理服务字段：APISIX返回的是service_id，前端期望的是service
                    normalized.service = normalized.service || normalized.service_id || '';
                    
                    normalized.methods = normalized.methods || ['GET'];
                    
                    // 处理状态字段：APISIX可能返回数字状态，需要转换为字符串
                    if (normalized.status === 1 || normalized.status === '1') {
                        normalized.status = 'enabled';
                    } else if (normalized.status === 0 || normalized.status === '0') {
                        normalized.status = 'disabled';
                    } else {
                        normalized.status = normalized.status || 'enabled';
                    }
                    
                    normalized.name = normalized.name || `路由-${normalized.id || 'unknown'}`;
                    normalized.description = normalized.description || normalized.desc || '';
                    
                    // 处理时间戳转换
                    if (normalized.create_time && typeof normalized.create_time === 'number') {
                        normalized.createTime = new Date(normalized.create_time * 1000).toLocaleString('zh-CN');
                    } else if (normalized.createTime) {
                        normalized.createTime = normalized.createTime;
                    } else {
                        normalized.createTime = new Date().toLocaleString('zh-CN');
                    }
                    break;
                    
                case 'upstreams':
                    // 处理APISIX上游数据格式
                    if (normalized.key && !normalized.id) {
                        normalized.id = normalized.key.replace('/apisix/upstreams/', '');
                    }
                    
                    // 处理名称字段：APISIX返回的是desc，前端期望的是name
                    normalized.name = normalized.name || normalized.desc || `上游-${normalized.id || 'unknown'}`;
                    
                    normalized.nodes = normalized.nodes || [];
                    normalized.loadBalancer = normalized.loadBalancer || 'roundrobin';
                    normalized.status = normalized.status || 'enabled';
                    normalized.createTime = normalized.createTime || new Date().toLocaleString();
                    
                    // 构建上游与服务的关联关系
                    normalized.services = [];
                    if (this.servicesData && this.servicesData.length > 0) {
                        const relatedServices = this.servicesData.filter(service => service.upstream === normalized.id);
                        normalized.services = relatedServices.map(service => service.name || service.id);
                    }
                    break;
                    
                case 'ssl':
                    // 处理APISIX SSL数据格式
                    if (normalized.key && !normalized.id) {
                        normalized.id = normalized.key.replace('/apisix/ssls/', '');
                    }
                    normalized.snis = normalized.snis || [];
                    normalized.status = normalized.status || 'enabled';
                    normalized.createTime = normalized.createTime || new Date().toLocaleString();
                    break;
            }
            
            console.log(`${type} 单个项目验证后:`, normalized);
            return normalized;
        }).filter(Boolean); // 过滤掉null值
        
        console.log(`=== ${type} 数据验证完成 ===`);
        console.log(`${type} 标准化后数据:`, normalizedData);
        return normalizedData;
    }

    // 重新构建数据关系
    rebuildDataRelationships() {
        console.log('=== 开始重新构建数据关系 ===');
        
        // 重新构建服务与路由的关系
        if (this.servicesData && this.routesData) {
            this.servicesData.forEach(service => {
                const relatedRoutes = this.routesData.filter(route => route.service === service.id);
                service.routes = relatedRoutes.map(route => route.name || route.id);
                console.log(`服务 ${service.id} 关联的路由:`, service.routes);
            });
        }
        
        // 重新构建上游与服务的关联关系
        if (this.upstreamsData && this.servicesData) {
            this.upstreamsData.forEach(upstream => {
                const relatedServices = this.servicesData.filter(service => service.upstream === upstream.id);
                upstream.services = relatedServices.map(service => service.name || service.id);
                console.log(`上游 ${upstream.id} 关联的服务:`, upstream.services);
            });
        }
        
        console.log('=== 数据关系重建完成 ===');
    }

    // 更新消费者的路由信息
    async updateConsumerRoutes() {
        console.log('=== 开始更新消费者路由信息 ===');
        console.log('当前路由数据:', JSON.stringify(this.routesData, null, 2));
        console.log('路由详细信息:', this.routesData.map(r => ({
            id: r.id,
            uri: r.uri,
            desc: r.desc,
            service: r.service,
            service_id: r.service_id,
            consumer: r.consumer,
            username: r.username,
            consumer_id: r.consumer_id,
            methods: r.methods,
            status: r.status,
            // 添加更多可能的字段
            allFields: Object.keys(r),
            fullData: r
        })));
        console.log('当前消费者数据:', JSON.stringify(this.consumersData, null, 2));
        
        // 构建消费者到路由的映射关系
        const consumerToRoutes = {};
        
        // 初始化所有消费者的路由数组
        this.consumersData.forEach(consumer => {
            consumerToRoutes[consumer.id] = [];
        });
        
        // 方法1：从路由配置中查找消费者关联
        this.routesData.forEach(route => {
            console.log(`检查路由 ${route.id}:`, route);
            
            // 检查多种可能的消费者关联字段
            const consumerId = route.consumer || route.username || route.consumer_id || route.consumer_name;
            
            if (consumerId && consumerToRoutes[consumerId]) {
                consumerToRoutes[consumerId].push(route.id);
                console.log(`路由 ${route.id} 关联到消费者 ${consumerId}`);
            } else if (consumerId) {
                console.log(`路由 ${route.id} 关联的消费者 ${consumerId} 不存在于当前消费者列表中`);
            } else {
                console.log(`路由 ${route.id} 没有关联消费者`);
            }
        });
        
        // 方法2：通过消费者用户名查找关联（如果路由中有username字段）
        this.routesData.forEach(route => {
            if (route.username && !consumerToRoutes[route.username]) {
                // 通过用户名查找消费者
                const consumer = this.consumersData.find(c => c.username === route.username);
                if (consumer) {
                    if (!consumerToRoutes[consumer.id]) {
                        consumerToRoutes[consumer.id] = [];
                    }
                    consumerToRoutes[consumer.id].push(route.id);
                    console.log(`通过用户名找到关联：路由 ${route.id} -> 消费者 ${consumer.username} (${consumer.id})`);
                }
            }
        });
        
        // 方法3：尝试通过API获取每个消费者的详细信息
        console.log('=== 尝试通过API获取消费者详细信息 ===');
        for (const consumer of this.consumersData) {
            try {
                const consumerDetail = await this.apisixRequest(`/consumers/${consumer.username}`);
                console.log(`消费者 ${consumer.username} 的详细信息:`, consumerDetail);
                
                // 检查详细信息中是否包含路由关联
                if (consumerDetail && consumerDetail.routes) {
                    consumer.routes = consumerDetail.routes;
                    console.log(`从API获取到消费者 ${consumer.username} 的路由:`, consumer.routes);
                }
            } catch (error) {
                console.log(`获取消费者 ${consumer.username} 详细信息失败:`, error.message);
            }
        }
        
        // 更新消费者数据中的路由信息（如果API没有获取到）
        this.consumersData.forEach(consumer => {
            if (!consumer.routes || consumer.routes.length === 0) {
                consumer.routes = consumerToRoutes[consumer.id] || [];
            }
            console.log(`消费者 ${consumer.id} (${consumer.username}) 的最终路由:`, consumer.routes);
        });
        
        console.log('消费者路由信息更新完成:', consumerToRoutes);
    }

    // 更新所有页面的显示
    async updateAllPageDisplays() {
        // 根据当前页面更新显示
        switch(this.currentPage) {
            case 'routes':
                this.displayRoutesWithPagination(this.routesData);
                this.updateRoutesStats();
                break;
            case 'services':
                this.displayServicesWithPagination(this.servicesData);
                this.updateServicesStats();
                break;
            case 'upstreams':
                this.displayUpstreamsWithPagination(this.upstreamsData);
                this.updateUpstreamsStats();
                break;
            case 'consumers':
                // 更新消费者的路由信息
                await this.updateConsumerRoutes();
                this.displayConsumersWithPagination(this.consumersData);
                this.updateConsumersStats();
                break;
            case 'ssl':
                this.displaySSLsWithPagination(this.sslData);
                this.updateSSLsStats();
                break;
            case 'system-settings':
                // 更新访问链路表格
                this.refreshAccessChainTable();
                break;
        }
    }

    // 清空所有数据
    clearAllData() {
        if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
            try {
                localStorage.removeItem('apisix_services');
                localStorage.removeItem('apisix_consumers');
                localStorage.removeItem('apisix_routes');
                localStorage.removeItem('apisix_upstreams');
                localStorage.removeItem('apisix_ssl');
                
                this.servicesData = [];
                this.consumersData = [];
                this.routesData = [];
                this.upstreamsData = [];
                this.sslData = [];
                
                // 刷新所有页面显示
                this.refreshAllData();
                
                this.showNotification('所有数据已清空', 'success');
            } catch (error) {
                console.error('清空数据失败:', error);
                this.showNotification('清空数据失败', 'error');
            }
        }
    }

    // 刷新所有数据
    refreshAllData() {
        this.currentPage = 1;
        
        // 刷新服务管理
        if (this.servicesData) {
            this.displayServicesWithPagination(this.servicesData);
        this.updateServicesStats();
        }
        
        // 刷新消费管理
        if (this.consumersData) {
            this.displayConsumersWithPagination(this.consumersData);
            this.updateConsumersStats();
        }
        
        // 刷新路由管理
        if (this.routesData) {
            this.displayRoutesWithPagination(this.routesData);
            this.updateRoutesStats();
        }
        
        // 刷新上游管理
        if (this.upstreamsData) {
            this.displayUpstreamsWithPagination(this.upstreamsData);
            this.updateUpstreamsStats();
        }
        
        // 刷新证书管理
        if (this.sslData) {
            this.displaySSLsWithPagination(this.sslData);
            this.updateSSLsStats();
        }
    }

    // 处理数据导入
    handleDataImport() {
        const dataType = document.getElementById('import-data-type').value;
        const fileInput = document.getElementById('import-data-file');
        
        if (!fileInput.files || fileInput.files.length === 0) {
            this.showNotification('请选择要导入的文件', 'warning');
            return;
        }
        
        const file = fileInput.files[0];
        if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
            this.showNotification('请选择JSON格式的文件', 'error');
            return;
        }
        
        // 调用导入函数
        this.importData(dataType, file);
        
        // 清空文件选择
        fileInput.value = '';
    }

    // ==================== 服务管理插件选择功能 ====================
    
    // 显示服务插件选择器
    showServicePluginSelector() {
        this.showPluginSelector('service', null, (selectedPlugins) => {
            this.updateServicePluginSelection(selectedPlugins);
        });
    }
    
    // 更新服务插件选择
    updateServicePluginSelection(selectedPlugins) {
        // 存储当前选择的插件
        this.currentServicePlugins = selectedPlugins || [];
        
        if (!selectedPlugins || selectedPlugins.length === 0) {
            // 清空选择
            document.getElementById('selected-service-plugins').innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="mdi mdi-information-outline me-1"></i>
                    点击"选择插件"按钮为服务添加插件配置
                </div>
            `;
            document.getElementById('service-plugin-configs').classList.add('d-none');
            return;
        }
        
        // 显示已选择的插件
        const pluginsHtml = selectedPlugins.map(plugin => `
            <div class="alert alert-info alert-dismissible fade show mb-2" role="alert">
                <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <h6 class="mb-1">
                        <i class="mdi mdi-puzzle me-2"></i>${plugin.plugin_name}
                    </div>
                    <p class="mb-1 small">${plugin.name || '默认配置'}</p>
                    <small class="text-muted">
                        创建时间: ${new Date(plugin.created_at).toLocaleString()}
                    </small>
                </div>
                <button type="button" class="btn-close" onclick="window.apisixAdmin.removeServicePlugin('${plugin.id}')"></button>
            </div>
        `).join('');
        
        document.getElementById('selected-service-plugins').innerHTML = pluginsHtml;
        
        // 显示插件配置详情
        this.updateServicePluginConfigs(selectedPlugins);
        document.getElementById('service-plugin-configs').classList.remove('d-none');
    }
    
    // 更新服务插件配置详情
    updateServicePluginConfigs(selectedPlugins) {
        const configList = document.getElementById('service-plugin-config-list');
        if (!configList) return;
        
        console.log('=== 更新服务插件配置详情 ===');
        console.log('选中的插件:', selectedPlugins);
        
        const configsHtml = selectedPlugins.map(plugin => {
            console.log(`插件 ${plugin.plugin_name} 的配置:`, plugin.config);
            return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="mdi mdi-cog me-2"></i>${plugin.plugin_name} 配置
                    </h6>
                    <div>
                        <button class="btn btn-outline-success btn-sm me-2" type="button" onclick="window.apisixAdmin.togglePluginConfigEdit('${plugin.id}', 'service')">
                            <i class="mdi mdi-pencil me-1"></i>编辑配置
                        </button>
                        <button class="btn btn-primary btn-sm" type="button" onclick="window.apisixAdmin.savePluginConfigDirect('${plugin.id}', 'service')" style="display: none;" id="save-btn-${plugin.id}">
                            <i class="mdi mdi-content-save me-1"></i>保存
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="mb-2">
                        <textarea class="form-control" id="config-${plugin.id}" rows="8" style="font-family: monospace; font-size: 12px; width: 100%;" readonly>${JSON.stringify(plugin.config, null, 2)}</textarea>
                </div>
            </div>
            </div>
        `;
        }).join('');
        
        configList.innerHTML = configsHtml;
    }
    
    // 编辑服务插件配置（保留兼容性）
    editServicePluginConfig(pluginId) {
        const plugin = this.currentServicePlugins.find(p => p.id === pluginId);
        if (!plugin) return;
        
        // 显示插件配置编辑模态框
        this.showPluginConfigEditor('service', plugin);
    }
    
    // 移除服务插件
    removeServicePlugin(pluginId) {
        if (!this.currentServicePlugins) return;
        
        // 从当前选择中移除插件
        this.currentServicePlugins = this.currentServicePlugins.filter(p => p.id !== pluginId);
        
        // 更新UI显示
        this.updateServicePluginSelection(this.currentServicePlugins);
        
        this.showNotification('插件已移除', 'success');
    }
    
    // 重置服务插件选择状态
    resetServicePluginSelection() {
        // 清空插件选择
        this.currentServicePlugins = [];
        
        // 重置UI显示
        document.getElementById('selected-service-plugins').innerHTML = `
            <div class="text-muted text-center py-3">
                <i class="mdi mdi-information-outline me-1"></i>
                点击"选择插件"按钮为服务添加插件配置
            </div>
        `;
        document.getElementById('service-plugin-configs').classList.add('d-none');
    }

    // 显示服务列表（带分页）
    displayServicesWithPagination(services) {
        const tbody = document.getElementById('services-tbody');
        if (!tbody) return;
        
        console.log('显示服务列表，数据:', services);
        console.log('服务ID列表:', services.map(s => s.id));
        
        if (services.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        <i class="mdi mdi-cog mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无服务数据</p>
                    </td>
                </tr>
            `;
            this.updateServicesPagination(0);
            return;
        }
        
        // 计算分页
        const totalPages = Math.ceil(services.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, services.length);
        const currentPageServices = services.slice(startIndex, endIndex);
        
        // 渲染当前页数据
        tbody.innerHTML = currentPageServices.map(service => `
            <tr>
                <td><code>${service.id}</code></td>
                <td>
                    <div>
                        <strong>${service.name}</strong>
                        ${service.description ? `<br><small class="text-muted">${service.description}</small>` : ''}
                    </div>
                </td>
                <td>
                    <span class="badge bg-info">${service.upstream}</span>
                </td>
                <td>
                    ${(service.routes && Array.isArray(service.routes) && service.routes.length > 0) 
                        ? service.routes.map(route => `<span class="badge bg-light text-dark me-1">${route}</span>`).join('') 
                        : '<span class="text-muted">无</span>'
                    }
                </td>
                <td>
                    ${(service.plugins && typeof service.plugins === 'object' && Object.keys(service.plugins).length > 0) 
                        ? Object.keys(service.plugins).map(pluginName => {
                            let badgeClass = 'bg-primary';
                            if (pluginName === 'cors') badgeClass = 'bg-success';
                            else if (pluginName === 'proxy-rewrite') badgeClass = 'bg-info';
                            else if (pluginName === 'response-rewrite') badgeClass = 'bg-secondary';
                            else if (pluginName === 'logger') badgeClass = 'bg-dark';
                            else if (pluginName === 'http-log') badgeClass = 'bg-dark';
                            else if (pluginName === 'fault-injection') badgeClass = 'bg-danger';
                            else if (pluginName === 'request-validation') badgeClass = 'bg-warning';
                            else if (pluginName === 'transform') badgeClass = 'bg-secondary';
                            else if (pluginName === 'grpc-transcode') badgeClass = 'bg-info';
                            else if (pluginName === 'serverless-pre-function') badgeClass = 'bg-success';
                            else if (pluginName === 'serverless-post-function') badgeClass = 'bg-success';
                            else if (pluginName === 'csrf') badgeClass = 'bg-danger';
                            else if (pluginName === 'uri-blocker') badgeClass = 'bg-danger';
                            else if (pluginName === 'referer-restriction') badgeClass = 'bg-warning';
                            return `<span class="badge ${badgeClass} me-1" title="${pluginName}">${pluginName}</span>`;
                        }).join('') 
                        : '<span class="text-muted">无</span>'
                    }
                    ${service.pluginConfigs && service.pluginConfigs.length > 0 ? 
                        `<br><small class="text-muted">配置模板: ${service.pluginConfigs.length} 个</small>` : ''}
                </td>
                <td>
                    <span class="badge ${service.status === 'enabled' ? 'bg-success' : 'bg-warning'}">
                        ${service.status === 'enabled' ? '已启用' : '已禁用'}
                    </span>
                </td>
                <td>${service.createTime}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.editService('${service.id}')" title="编辑">
                            <i class="mdi mdi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="window.apisixAdmin.viewService('${service.id}')" title="预览">
                            <i class="mdi mdi-eye"></i>
                        </button>
                        <button class="btn btn-outline-${service.status === 'enabled' ? 'warning' : 'success'}" 
                                onclick="window.apisixAdmin.toggleServiceStatus('${service.id}')" 
                                title="${service.status === 'enabled' ? '禁用' : '启用'}">
                            <i class="mdi mdi-${service.status === 'enabled' ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="window.apisixAdmin.deleteService('${service.id}')" title="删除">
                            <i class="mdi mdi-delete"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // 更新分页信息
        this.updateServicesPagination(services.length, totalPages, startIndex + 1, endIndex);
    }

    // 更新服务分页
    updateServicesPagination(totalItems, totalPages, startItem, endItem) {
        const pagination = document.getElementById('services-pagination');
        const startSpan = document.getElementById('services-start');
        const endSpan = document.getElementById('services-end');
        const totalSpan = document.getElementById('services-total');
        
        if (startSpan) startSpan.textContent = startItem;
        if (endSpan) endSpan.textContent = endItem;
        if (totalSpan) totalSpan.textContent = totalItems;
        
        if (!pagination) return;
        
        let paginationHTML = '';
        
        // 上一页
        paginationHTML += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToServicePage(${this.currentPage - 1})">
                    <i class="mdi mdi-chevron-left"></i>
                </a>
            </li>
        `;
        
        // 页码
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="window.apisixAdmin.goToServicePage(${i})">${i}</a>
                </li>
            `;
        }
        
        // 下一页
        paginationHTML += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToServicePage(${this.currentPage + 1})">
                    <i class="mdi mdi-chevron-right"></i>
                </a>
            </li>
        `;
        
        pagination.innerHTML = paginationHTML;
    }

    // 跳转到服务页面
    goToServicePage(page) {
        if (page < 1 || page > Math.ceil(this.servicesData.length / this.pageSize)) return;
        this.currentPage = page;
        this.displayServicesWithPagination(this.servicesData);
    }

    // 更新服务统计
    updateServicesStats() {
        const totalServices = this.servicesData ? this.servicesData.length : 0;
        const enabledServices = this.servicesData ? this.servicesData.filter(s => s.status === 'enabled').length : 0;
        const disabledServices = this.servicesData ? this.servicesData.filter(s => s.status === 'disabled').length : 0;
        
        // 计算所有服务的插件总数
        let totalPlugins = 0;
        if (this.servicesData) {
            this.servicesData.forEach(service => {
                if (service.plugins && typeof service.plugins === 'object') {
                    totalPlugins += Object.keys(service.plugins).length;
                }
            });
        }
        
        const totalElement = document.getElementById('total-services');
        const enabledElement = document.getElementById('enabled-services');
        const disabledElement = document.getElementById('disabled-services');
        const pluginsElement = document.getElementById('total-service-plugins');
        
        if (totalElement) totalElement.textContent = totalServices;
        if (enabledElement) enabledElement.textContent = enabledServices;
        if (disabledElement) disabledElement.textContent = disabledServices;
        if (pluginsElement) pluginsElement.textContent = totalPlugins;
    }

    // 绑定服务管理事件
    bindServicesEvents() {
        // 搜索功能
        const searchInput = document.getElementById('service-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterServices(e.target.value);
            });
        }
        
        // 排序功能
        this.bindServicesSorting();
        
        // 加载上游选项
        this.loadUpstreamOptions();
    }

    // 绑定服务排序功能
    bindServicesSorting() {
        const sortableHeaders = document.querySelectorAll('#services-table .sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                this.sortServices(sortField);
            });
        });
    }

    // 排序服务
    sortServices(sortField) {
        // 切换排序方向
        if (this.currentSortField === sortField) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = sortField;
            this.currentSortDirection = 'asc';
        }
        
        // 更新排序图标
        this.updateSortIcons('services-table', sortField, this.currentSortDirection);
        
        // 排序数据
        const sortedData = [...this.servicesData].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // 特殊处理某些字段
            if (sortField === 'plugins') {
                aValue = a.plugins ? a.plugins.length : 0;
                bValue = b.plugins ? b.plugins.length : 0;
            } else if (sortField === 'createTime') {
                aValue = new Date(a.createTime);
                bValue = new Date(b.createTime);
            }
            
            // 字符串比较
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (this.currentSortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });
        
        // 重新显示排序后的数据
        this.currentPage = 1;
        this.displayServicesWithPagination(sortedData);
    }

    // 搜索服务
    filterServices(searchTerm) {
        if (!searchTerm) {
            this.currentPage = 1;
            this.displayServicesWithPagination(this.servicesData);
            return;
        }
        
        const filtered = this.servicesData.filter(service => 
            service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            service.upstream.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        this.currentPage = 1;
        this.displayServicesWithPagination(filtered);
    }

    // 加载上游选项
    loadUpstreamOptions() {
        const upstreamSelect = document.getElementById('service-upstream');
        if (!upstreamSelect) {
            console.error('未找到上游选择框元素');
            return;
        }
        
        if (!this.upstreamsData) {
            console.error('上游数据未加载');
            return;
        }
        
        console.log('加载上游选项，当前上游数据:', this.upstreamsData);
        
        // 保存当前选中的值
        const currentValue = upstreamSelect.value;
        
        // 清空现有选项
        upstreamSelect.innerHTML = '<option value="">请选择上游服务</option>';
        
        // 添加上游选项
        this.upstreamsData.forEach(upstream => {
            console.log('添加上游选项:', upstream);
            const option = document.createElement('option');
            option.value = upstream.id;
            option.textContent = `${upstream.name} (${upstream.id})`;
            upstreamSelect.appendChild(option);
        });
        
        console.log('上游选项加载完成，共', this.upstreamsData.length, '个选项');
        
        // 恢复选中的值
        if (currentValue) {
            upstreamSelect.value = currentValue;
        }
    }

    // 创建服务
    createService() {
        document.getElementById('serviceModalLabel').innerHTML = '<i class="mdi mdi-plus-circle me-2"></i>新建服务';
        document.getElementById('service-form').reset();
        document.getElementById('service-id').value = '';
        document.getElementById('service-id').disabled = false;
        
        // 设置默认值
        document.getElementById('service-enabled').checked = true;
        
        // 初始化插件选择状态
        this.resetServicePluginSelection();
        
        // 加载上游选项
        this.loadUpstreamOptions();
        
        const modal = new bootstrap.Modal(document.getElementById('serviceModal'));
        modal.show();
    }

    // 编辑服务
    editService(serviceId) {
        console.log('编辑服务，ID:', serviceId);
        console.log('当前服务数据:', this.servicesData);
        
        const service = this.servicesData.find(s => s.id === serviceId);
        if (!service) {
            console.error('未找到服务，ID:', serviceId);
            console.error('可用服务ID:', this.servicesData.map(s => s.id));
            this.showNotification(`服务不存在: ${serviceId}`, 'error');
            return;
        }
        
        document.getElementById('serviceModalLabel').innerHTML = '<i class="mdi mdi-pencil me-2"></i>编辑服务';
        document.getElementById('service-id').value = service.id;
        document.getElementById('service-id').disabled = true;
        document.getElementById('service-name').value = service.name;
        document.getElementById('service-upstream').value = service.upstream;
        document.getElementById('service-desc').value = service.description || '';
        document.getElementById('service-enabled').checked = service.status === 'enabled';
        
        // 插件配置 - 完全参考消费管理的处理方式
        console.log('=== 服务插件配置处理 ===');
        console.log('服务原始数据:', service);
        console.log('服务plugins字段:', service.plugins);
        console.log('服务plugins类型:', typeof service.plugins);
        console.log('服务plugins键:', service.plugins ? Object.keys(service.plugins) : '无插件');
        
        if (service.plugins && typeof service.plugins === 'object' && Object.keys(service.plugins).length > 0) {
            console.log('处理服务插件配置:', service.plugins);
            // 将plugins对象转换为插件配置数组，完全按照消费管理的方式
            this.currentServicePlugins = Object.keys(service.plugins).map(pluginName => {
                const pluginConfig = service.plugins[pluginName];
                console.log(`插件 ${pluginName} 的配置:`, pluginConfig);
                return {
                    id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    plugin_name: pluginName,
                    name: `${pluginName}配置`,
                    config: pluginConfig,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });
            console.log('转换后的服务插件数组:', this.currentServicePlugins);
            this.updateServicePluginSelection(this.currentServicePlugins);
        } else {
            console.log('服务没有插件配置');
            this.currentServicePlugins = [];
            this.updateServicePluginSelection([]);
        }
        
        // 加载上游选项
        this.loadUpstreamOptions();
        
        const modal = new bootstrap.Modal(document.getElementById('serviceModal'));
        modal.show();
    }

    // 查看服务
    viewService(serviceId) {
        const service = this.servicesData.find(s => s.id === serviceId);
        if (!service) {
            this.showNotification('服务不存在', 'error');
            return;
        }
        
        // 显示服务详情模态框
        this.showServiceDetailsModal(service);
    }

    // 显示服务详情模态框
    showServiceDetailsModal(service) {
        // 构建插件配置详情HTML
        let pluginDetailsHTML = '';
        if (service.pluginConfigs && service.pluginConfigs.length > 0) {
            pluginDetailsHTML = `
                <div class="card mb-3">
                    <div class="card-header">
                        <h6 class="mb-0"><i class="mdi mdi-puzzle me-2"></i>插件配置详情</h6>
                    </div>
                    <div class="card-body">
                        ${service.pluginConfigs.map(plugin => `
                            <div class="mb-3 p-3 border rounded">
                                <h6 class="mb-2">
                                    <i class="mdi mdi-cog me-2"></i>${plugin.plugin_name}
                                    <small class="text-muted ms-2">(${plugin.name || '默认配置'})</small>
                                </h6>
                                <pre class="bg-light p-2 rounded small mb-2"><code>${JSON.stringify(plugin.config, null, 2)}</code></pre>
                                <small class="text-muted">
                                    创建时间: ${new Date(plugin.created_at).toLocaleString()}
                                </small>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        const modalHTML = `
            <div class="modal fade" id="serviceDetailsModal" tabindex="-1" aria-labelledby="serviceDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="serviceDetailsModalLabel">
                                <i class="mdi mdi-eye me-2"></i>服务配置预览
                            </h5>
                        </div>
                        <div class="modal-body">
                            ${pluginDetailsHTML}
                            <div class="card">
                                <div class="card-header">
                                    <h6 class="mb-0"><i class="mdi mdi-code-json me-2"></i>完整配置JSON</h6>
                                </div>
                                <div class="card-body p-0">
                                    <pre class="bg-dark text-light p-4 m-0" style="font-size: 0.9rem; max-height: 50vh; overflow-y: auto; border-radius: 0;"><code>${JSON.stringify(service, null, 2)}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById('serviceDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新的模态框到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('serviceDetailsModal'), {
            backdrop: true,
            keyboard: true
        });
        modal.show();
        
        // 模态框关闭后清理DOM
        document.getElementById('serviceDetailsModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 切换服务状态
    toggleServiceStatus(serviceId) {
        const service = this.servicesData.find(s => s.id === serviceId);
        if (!service) {
            this.showNotification('服务不存在', 'error');
            return;
        }
        
        const newStatus = service.status === 'enabled' ? 'disabled' : 'enabled';
        const action = newStatus === 'enabled' ? '启用' : '禁用';
        
        this.showConfirm(`确定要${action}服务 "${service.name}" 吗？`, () => {
            service.status = newStatus;
            this.currentPage = 1;
            this.displayServicesWithPagination(this.servicesData);
            this.updateServicesStats();
            this.showNotification(`服务已${action}`, 'success');
        });
    }

    // 删除服务
    async deleteService(serviceId) {
        console.log('=== 开始删除服务 ===');
        console.log('要删除的服务ID:', serviceId);
        
        const service = this.servicesData.find(s => s.id === serviceId);
        if (!service) {
            console.error('服务不存在:', serviceId);
            this.showNotification('服务不存在', 'error');
            return;
        }
        
        console.log('找到要删除的服务:', service);
        
        // 删除前检查服务是否被使用
        const routesUsingService = this.routesData.filter(route => route.service === serviceId);
        if (routesUsingService.length > 0) {
            const routeNames = routesUsingService.map(r => r.name || r.id).join(', ');
            this.showNotification(`无法删除服务：该服务正在被以下路由使用：${routeNames}。请先删除或修改这些路由。`, 'warning');
            return;
        }
        
        this.showConfirm(`确定要删除服务 "${service.name}" 吗？此操作不可恢复！`, async () => {
            try {
                console.log('用户确认删除，开始调用APISIX API...');
                
                // 调用APISIX API删除服务
                const response = await this.apisixRequest(`/services/${serviceId}`, {
                    method: 'DELETE'
                });
                
                console.log('APISIX删除响应:', response);
                this.showNotification('正在刷新数据...', 'info');
                
                // 重新获取服务数据
                console.log('开始重新获取服务数据...');
                const freshServices = await this.getServices();
                console.log('重新获取的原始数据:', freshServices);
                
                if (freshServices && Array.isArray(freshServices)) {
                    console.log('数据是数组，开始标准化处理...');
                    // 数据标准化处理
                    const normalizedServices = this.validateAndNormalizeData(freshServices, 'services');
                    console.log('标准化后的数据:', normalizedServices);
                    
                    this.servicesData = normalizedServices;
                    console.log('更新后的servicesData:', this.servicesData);
        
        // 保存到本地存储
        this.saveToStorage('services', this.servicesData);
        
                    // 重新显示列表
            this.currentPage = 1;
            this.displayServicesWithPagination(this.servicesData);
            this.updateServicesStats();
                    
                    this.showNotification('服务已删除，数据已刷新', 'success');
                } else {
                    console.log('重新获取数据失败或格式不正确，使用本地删除');
                    // 如果重新读取失败，使用本地删除
                    this.servicesData = this.servicesData.filter(s => s.id !== serviceId);
                    this.saveToStorage('services', this.servicesData);
                    this.currentPage = 1;
                    this.displayServicesWithPagination(this.servicesData);
                    this.updateServicesStats();
                    this.showNotification('服务已删除，但数据刷新失败', 'warning');
                }
            } catch (error) {
                console.error('删除服务失败:', error);
                console.error('错误详情:', {
                    method: 'DELETE',
                    url: `/services/${serviceId}`,
                    error: error.message
                });
                
                // 检查是否是"服务正在被使用"的错误
                if (error.message && error.message.includes('400') && error.message.includes('Bad Request')) {
                    // 尝试解析错误详情
                    try {
                        // 检查是否有路由在使用这个服务
                        const routesUsingService = this.routesData.filter(route => route.service === serviceId);
                        if (routesUsingService.length > 0) {
                            const routeNames = routesUsingService.map(r => r.name || r.id).join(', ');
                            this.showNotification(`无法删除服务：该服务正在被以下路由使用：${routeNames}。请先删除或修改这些路由。`, 'warning');
                        } else {
                            this.showNotification(`删除失败：服务可能正在被其他资源使用，请检查后再试。`, 'warning');
                        }
                    } catch (parseError) {
                        this.showNotification(`删除失败：${error.message}`, 'error');
                    }
                } else {
                    this.showNotification(`删除失败: ${error.message}`, 'error');
                }
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }

    // 保存服务
    async saveService() {
        console.log('=== 开始保存服务 ===');
        
        const form = document.getElementById('service-form');
        if (!form.checkValidity()) {
            console.log('表单验证失败');
            form.reportValidity();
            return;
        }
        
        console.log('表单验证通过');
        
        // 处理插件配置
        let processedPlugins = {};
        if (this.currentServicePlugins && this.currentServicePlugins.length > 0) {
            this.currentServicePlugins.forEach(plugin => {
                let cleanedConfig = { ...plugin.config };
                
                // CORS插件特殊处理
                if (plugin.plugin_name === 'cors') {
                    // 将数组字段转换为APISIX期望的字符串格式
                    if (cleanedConfig.allow_origins && Array.isArray(cleanedConfig.allow_origins)) {
                        cleanedConfig.allow_origins = cleanedConfig.allow_origins.join(',');
                    }
                    
                    if (cleanedConfig.allow_methods && Array.isArray(cleanedConfig.allow_methods)) {
                        cleanedConfig.allow_methods = cleanedConfig.allow_methods.join(',');
                    }
                    
                    if (cleanedConfig.allow_headers && Array.isArray(cleanedConfig.allow_headers)) {
                        cleanedConfig.allow_headers = cleanedConfig.allow_headers.join(',');
                    }
                    
                    if (cleanedConfig.expose_headers && Array.isArray(cleanedConfig.expose_headers)) {
                        cleanedConfig.expose_headers = cleanedConfig.expose_headers.join(',');
                    }
                    
                    // 处理allow_origins_by_regex字段
                    if (cleanedConfig.allow_origins_by_regex && Array.isArray(cleanedConfig.allow_origins_by_regex) && cleanedConfig.allow_origins_by_regex.length === 0) {
                        delete cleanedConfig.allow_origins_by_regex;
                    }
                    
                    // 如果所有字段都为空，跳过这个插件
                    if (!cleanedConfig.allow_origins && !cleanedConfig.allow_origins_by_regex && !cleanedConfig.allow_methods && !cleanedConfig.allow_headers) {
                        console.log('CORS插件的所有字段都为空，跳过该插件');
                        return;
                    }
                }
                
                // consumer-restriction插件特殊处理
                if (plugin.plugin_name === 'consumer-restriction') {
                    if (cleanedConfig.blacklist && Array.isArray(cleanedConfig.blacklist) && cleanedConfig.blacklist.length === 0) {
                        delete cleanedConfig.blacklist;
                    }
                    if (cleanedConfig.whitelist && Array.isArray(cleanedConfig.whitelist) && cleanedConfig.whitelist.length === 0) {
                        delete cleanedConfig.whitelist;
                    }
                    if (!cleanedConfig.blacklist && !cleanedConfig.whitelist) {
                        console.log('consumer-restriction插件的白名单和黑名单都为空，跳过该插件');
                        return;
                    }
                }
                
                processedPlugins[plugin.plugin_name] = cleanedConfig;
            });
        }
        
        const serviceData = {
            id: document.getElementById('service-id').value || `service${Date.now()}`,
            name: document.getElementById('service-name').value,
            upstream: document.getElementById('service-upstream').value,
            description: document.getElementById('service-desc').value,
            status: document.getElementById('service-enabled').checked ? 'enabled' : 'disabled',
            createTime: new Date().toLocaleString('zh-CN'),
            plugins: processedPlugins
        };
        
        // 验证服务名称
        if (!serviceData.name || serviceData.name.trim() === '') {
            this.showNotification('服务名称不能为空', 'error');
            return;
        }
        
        // 验证上游配置
        if (!serviceData.upstream || serviceData.upstream.trim() === '') {
            this.showNotification('上游配置不能为空', 'error');
            return;
        }
        
        // 准备APISIX API数据格式
        const apisixData = {
            name: serviceData.name,
            upstream_id: serviceData.upstream,
            desc: serviceData.description || '',
            plugins: serviceData.plugins
        };
        
        console.log('准备保存的服务数据:', apisixData);
        console.log('服务ID:', serviceData.id);
        console.log('APISIX请求URL:', `/services/${serviceData.id}`);
    
        // 检查是否是编辑模式
        const existingIndex = this.servicesData.findIndex(s => s.id === serviceData.id);
        
        try {
            // APISIX服务API统一使用PUT方法（创建和更新）
            const response = await this.apisixRequest(`/services/${serviceData.id}`, {
                method: 'PUT',
                body: JSON.stringify(apisixData)
            });
            
            console.log('APISIX保存响应:', response);
            
            if (existingIndex >= 0) {
                this.showNotification('服务已更新到APISIX', 'success');
            } else {
                this.showNotification('服务已创建到APISIX', 'success');
            }
            
            // 保存成功后，立即从APISIX重新读取最新数据
            this.showNotification('正在刷新数据...', 'info');
            
            // 重新获取服务数据
            console.log('开始重新获取服务数据...');
            const freshServices = await this.getServices();
            console.log('重新获取的原始数据:', freshServices);
            
            if (freshServices && Array.isArray(freshServices)) {
                console.log('数据是数组，开始标准化处理...');
                // 数据标准化处理
                const normalizedServices = this.validateAndNormalizeData(freshServices, 'services');
                console.log('标准化后的数据:', normalizedServices);
                
                this.servicesData = normalizedServices;
                console.log('更新后的servicesData:', this.servicesData);
                
                // 保存到本地存储
                this.saveToStorage('services', this.servicesData);
                
                // 重新显示列表
                this.currentPage = 1;
                this.displayServicesWithPagination(this.servicesData);
                this.updateServicesStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('数据已刷新，显示最新配置', 'success');
            } else {
                console.log('重新获取数据失败或格式不正确，使用本地数据');
                // 如果重新读取失败，使用本地数据
                if (existingIndex >= 0) {
                    this.servicesData[existingIndex] = serviceData;
                } else {
                    this.servicesData.push(serviceData);
                }
                
                this.saveToStorage('services', this.servicesData);
                this.currentPage = 1;
                this.displayServicesWithPagination(this.servicesData);
                this.updateServicesStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('保存成功，但数据刷新失败', 'warning');
            }
            
            // 关闭模态框
            const modalElement = document.getElementById('serviceModal');
            if (modalElement) {
                try {
                    // 尝试使用Bootstrap 5的方法
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                    } else {
                        // 如果获取实例失败，直接操作DOM
                        modalElement.classList.remove('show');
                        modalElement.style.display = 'none';
                        document.body.classList.remove('modal-open');
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                    }
                } catch (error) {
                    console.warn('关闭模态框失败，使用DOM操作:', error);
                    // 直接操作DOM关闭模态框
                    modalElement.classList.remove('show');
                    modalElement.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.remove();
                    }
                }
            }
            
        } catch (error) {
            console.error('保存服务到APISIX失败:', error);
            this.showNotification('保存服务失败: ' + error.message, 'error');
        }
    }

    // 取消服务操作
    cancelService() {
        const modalElement = document.getElementById('serviceModal');
        if (modalElement) {
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
        }
        this.showNotification('操作已取消', 'info');
    }

    // 刷新服务
    refreshServices() {
        this.showNotification('正在刷新服务数据...', 'info');
        setTimeout(() => {
            this.currentPage = 1;
            this.initServicesData();
            this.updateServicesStats();
            this.showNotification('服务数据已刷新', 'success');
        }, 1000);
    }

    // ==================== 消费管理功能 ====================

    // 加载概览统计页面内容
    loadOverviewContent(contentDiv) {
        contentDiv.innerHTML = `
            <!-- 系统概览统计 -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h4 class="card-title mb-4">
                                <i class="mdi mdi-chart-line me-2"></i>系统概览统计
                            </h4>
                            <p class="text-muted mb-4">APISIX网关系统的整体运行状态和资源配置概览</p>
                            
                            <!-- 统计卡片行 -->
                            <div class="row mb-4">
                                <!-- 路由统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card border-left-primary shadow h-100 py-2">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">
                                                        路由总数
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-routes-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-routes mdi-2x text-primary"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 服务统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card border-left-success shadow h-100 py-2">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-success text-uppercase mb-1">
                                                        服务总数
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-services-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-cog mdi-2x text-success"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 上游统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card border-left-info shadow h-100 py-2">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-info text-uppercase mb-1">
                                                        上游总数
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-upstreams-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-server mdi-2x text-info"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 消费者统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card border-left-warning shadow h-100 py-2">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">
                                                        消费者总数
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-consumers-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-account-group mdi-2x text-warning"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 证书统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card border-left-danger shadow h-100 py-2">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-danger text-uppercase mb-1">
                                                        证书总数
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-ssl-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-certificate mdi-2x text-danger"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 插件统计 -->
                                <div class="col-xl-2 col-md-4 col-sm-6 mb-3">
                                    <div class="card shadow h-100 py-2" style="border-left: 4px solid #6f42c1;">
                                        <div class="card-body">
                                            <div class="row no-gutters align-items-center">
                                                <div class="col mr-2">
                                                    <div class="text-xs font-weight-bold text-uppercase mb-1" style="color: #6f42c1;">
                                                        插件配置
                                                    </div>
                                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="overview-plugins-count">
                                                        <i class="mdi mdi-loading mdi-spin"></i>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <i class="mdi mdi-puzzle mdi-2x" style="color: #6f42c1;"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 访问链路关系配置 -->
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h4 class="card-title mb-4">
                                <i class="mdi mdi-sitemap me-2"></i>访问链路关系配置
                            </h4>
                            <p class="text-muted mb-4">显示系统中所有配置的访问链路关系，包括消费者、路由、服务、上游的完整链路</p>
                            
                            <div id="overview-access-chains">
                                <div class="text-center">
                                    <i class="mdi mdi-loading mdi-spin mdi-2x text-muted"></i>
                                    <p class="mt-2 text-muted">加载访问链路关系...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 加载统计数据
        this.loadOverviewStatistics();
    }

    // 加载概览统计数据
    loadOverviewStatistics() {
        console.log('=== 加载概览统计数据 ===');
        console.log('当前数据状态:', {
            routesData: this.routesData ? this.routesData.length : 0,
            servicesData: this.servicesData ? this.servicesData.length : 0,
            consumersData: this.consumersData ? this.consumersData.length : 0,
            upstreamsData: this.upstreamsData ? this.upstreamsData.length : 0,
            sslData: this.sslData ? this.sslData.length : 0
        });
        
        // 更新统计卡片
        this.updateOverviewCounts();
        
        // 更新访问链路关系
        this.updateOverviewAccessChains();
    }

    // 更新概览统计数量
    updateOverviewCounts() {
        // 路由统计
        const routesCount = document.getElementById('overview-routes-count');
        if (routesCount) {
            routesCount.textContent = this.routesData ? this.routesData.length : 0;
        }

        // 服务统计
        const servicesCount = document.getElementById('overview-services-count');
        if (servicesCount) {
            servicesCount.textContent = this.servicesData ? this.servicesData.length : 0;
        }

        // 上游统计
        const upstreamsCount = document.getElementById('overview-upstreams-count');
        if (upstreamsCount) {
            upstreamsCount.textContent = this.upstreamsData ? this.upstreamsData.length : 0;
        }

        // 消费者统计
        const consumersCount = document.getElementById('overview-consumers-count');
        if (consumersCount) {
            consumersCount.textContent = this.consumersData ? this.consumersData.length : 0;
        }

        // 证书统计
        const sslCount = document.getElementById('overview-ssl-count');
        if (sslCount) {
            sslCount.textContent = this.sslData ? this.sslData.length : 0;
        }

        // 插件配置统计
        const pluginsCount = document.getElementById('overview-plugins-count');
        if (pluginsCount) {
            // 统计所有配置中的插件数量
            let totalPlugins = 0;
            let routePlugins = 0;
            let servicePlugins = 0;
            let consumerPlugins = 0;
            
            // 统计路由中的插件
            if (this.routesData) {
                this.routesData.forEach(route => {
                    if (route.plugins && typeof route.plugins === 'object') {
                        const pluginCount = Object.keys(route.plugins).length;
                        routePlugins += pluginCount;
                        console.log(`路由 ${route.name || route.id} 有 ${pluginCount} 个插件:`, Object.keys(route.plugins));
                    }
                });
            }
            
            // 统计服务中的插件
            if (this.servicesData) {
                this.servicesData.forEach(service => {
                    if (service.plugins && typeof service.plugins === 'object') {
                        const pluginCount = Object.keys(service.plugins).length;
                        servicePlugins += pluginCount;
                        console.log(`服务 ${service.name || service.id} 有 ${pluginCount} 个插件:`, Object.keys(service.plugins));
                    }
                });
            }
            
            // 统计消费者中的插件
            if (this.consumersData) {
                this.consumersData.forEach(consumer => {
                    if (consumer.plugins && typeof consumer.plugins === 'object') {
                        const pluginCount = Object.keys(consumer.plugins).length;
                        consumerPlugins += pluginCount;
                        console.log(`消费者 ${consumer.username || consumer.id} 有 ${pluginCount} 个插件:`, Object.keys(consumer.plugins));
                    }
                });
            }
            
            totalPlugins = routePlugins + servicePlugins + consumerPlugins;
            
            console.log('插件配置统计结果:', {
                routePlugins,
                servicePlugins,
                consumerPlugins,
                totalPlugins
            });
            
            pluginsCount.textContent = totalPlugins;
        }
    }

    // 更新概览访问链路关系
    updateOverviewAccessChains() {
        const accessChainsContainer = document.getElementById('overview-access-chains');
        if (!accessChainsContainer) return;

        // 构建访问链路数据
        const accessChains = this.buildOverviewAccessChains();
        
        if (accessChains.length === 0) {
            accessChainsContainer.innerHTML = `
                <div class="text-center py-4">
                    <i class="mdi mdi-sitemap mdi-3x text-muted mb-3"></i>
                    <p class="text-muted">暂无访问链路配置数据</p>
                </div>
            `;
            return;
        }

        // 生成访问链路表格HTML
        const chainsHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th class="text-center" style="width: 6%;">序号</th>
                            <th class="text-center" style="width: 18%;">消费者</th>
                            <th class="text-center" style="width: 4%;"></th>
                            <th class="text-center" style="width: 18%;">路由</th>
                            <th class="text-center" style="width: 4%;"></th>
                            <th class="text-center" style="width: 18%;">服务</th>
                            <th class="text-center" style="width: 4%;"></th>
                            <th class="text-center" style="width: 18%;">上游</th>
                            <th class="text-center" style="width: 10%;">配置</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${accessChains.map((chain, index) => `
                            <!-- 主数据行 -->
                            <tr class="access-chain-row">
                                <td class="text-center">
                                    <span class="text-dark fw-bold">${index + 1}</span>
                                </td>
                                <td class="text-center">
                                    ${chain.consumer ? 
                                        `<span class="badge bg-warning">${chain.consumer.name || chain.consumer.id}</span>` : 
                                        '<span class="text-muted">未配置</span>'
                                    }
                                </td>
                                <td class="text-center">
                                    <i class="mdi mdi-arrow-right text-muted"></i>
                                </td>
                                <td class="text-center">
                                    ${chain.route ? 
                                        `<span class="badge bg-primary">${chain.route.name || chain.route.id}</span>` : 
                                        '<span class="text-muted">未配置</span>'
                                    }
                                </td>
                                <td class="text-center">
                                    <i class="mdi mdi-arrow-right text-muted"></i>
                                </td>
                                <td class="text-center">
                                    ${chain.service ? 
                                        `<span class="badge bg-success">${chain.service.name || chain.service.id}</span>` : 
                                        '<span class="text-muted">未配置</span>'
                                    }
                                </td>
                                <td class="text-center">
                                    <i class="mdi mdi-arrow-right text-muted"></i>
                                </td>
                                <td class="text-center">
                                    ${chain.upstream ? 
                                        `<span class="badge bg-info">${chain.upstream.name || chain.upstream.id}</span>` : 
                                        '<span class="text-muted">未配置</span>'
                                    }
                                </td>
                                <td class="text-center">
                                    <button class="btn btn-sm btn-outline-secondary" onclick="window.apisixAdmin.showChainJSON(${index})">
                                        <i class="mdi mdi-code-json"></i>
                                    </button>
                                    <input type="hidden" id="chain-data-${index}" value='${JSON.stringify(chain)}'>
                                </td>
                            </tr>
                            <!-- 插件归属行 -->
                            <tr class="plugin-ownership-row">
                                <td></td>
                                <td class="text-center">
                                    ${this.renderPluginOwnershipCell(chain, 'consumer')}
                                </td>
                                <td></td>
                                <td class="text-center">
                                    ${this.renderPluginOwnershipCell(chain, 'route')}
                                </td>
                                <td></td>
                                <td class="text-center">
                                    ${this.renderPluginOwnershipCell(chain, 'service')}
                                </td>
                                <td></td>
                                <td class="text-center">
                                    ${this.renderPluginOwnershipCell(chain, 'upstream')}
                                </td>
                                <td></td>
                            </tr>
                            <!-- 链路分隔行 -->
                            ${index < accessChains.length - 1 ? `
                                <tr class="chain-separator">
                                    <td colspan="9" style="height: 20px; background-color: #e9ecef; border: none;"></td>
                                </tr>
                            ` : ''}
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        accessChainsContainer.innerHTML = `
            <style>
                .access-chain-row {
                    transition: all 0.3s ease;
                }
                .access-chain-row:hover {
                    background-color: #f8f9fa !important;
                }
                .table th {
                    font-weight: 600;
                    color: #495057;
                    border-bottom: 2px solid #dee2e6;
                }
                .table td {
                    vertical-align: middle;
                    padding: 12px 8px;
                }
                .badge {
                    font-size: 0.8rem;
                    padding: 6px 10px;
                }
                .table-responsive {
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .plugin-ownership-row {
                    border: none;
                }
                .plugin-ownership-row td {
                    padding: 8px;
                    border: none;
                }
                .plugin-ownership-info {
                    padding: 4px;
                }
                .chain-separator {
                    background-color: #e9ecef;
                }
                .chain-separator td {
                    padding: 0;
                    border: none;
                }
                .mdi-arrow-right {
                    opacity: 0.7;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.7; }
                    50% { opacity: 1; }
                }
            </style>
            ${chainsHTML}
        `;
    }

    // 构建概览访问链路数据
    buildOverviewAccessChains() {
        const chains = [];
        
        // 基于路由数据构建链路
        if (this.routesData && this.routesData.length > 0) {
            this.routesData.forEach(route => {
                // 查找关联的服务
                const service = this.servicesData ? this.servicesData.find(s => s.id === route.service) : null;
                
                // 查找关联的上游
                const upstream = this.upstreamsData && service ? this.upstreamsData.find(u => u.id === service.upstream) : null;
                
                // 查找关联的消费者（通过多种方式）
                let consumer = null;
                
                // 方式1：直接关联
                if (route.consumer) {
                    consumer = this.consumersData ? this.consumersData.find(c => c.id === route.consumer) : null;
                }
                
                // 方式2：消费者限制插件
                if (!consumer && route.plugins && route.plugins['consumer-restriction']) {
                    const consumerRestriction = route.plugins['consumer-restriction'];
                    if (consumerRestriction.whitelist && consumerRestriction.whitelist.length > 0) {
                        const firstConsumerId = consumerRestriction.whitelist[0];
                        consumer = this.consumersData ? this.consumersData.find(c => c.id === firstConsumerId) : null;
                    }
                }
                
                // 方式3：通过认证插件查找（key-auth, basic-auth等）
                if (!consumer && route.plugins) {
                    const authPlugins = ['key-auth', 'basic-auth', 'jwt-auth', 'oauth2'];
                    for (const pluginName of authPlugins) {
                        if (route.plugins[pluginName]) {
                            // 如果有认证插件，尝试找到第一个消费者
                            if (this.consumersData && this.consumersData.length > 0) {
                                consumer = this.consumersData[0]; // 使用第一个消费者作为示例
                                console.log(`通过${pluginName}插件找到消费者:`, consumer);
                                break;
                            }
                        }
                    }
                }
                
                // 方式4：如果路由有名称，尝试通过名称匹配消费者
                if (!consumer && route.name && this.consumersData) {
                    const matchedConsumer = this.consumersData.find(c => 
                        (c.name && route.name.toLowerCase().includes(c.name.toLowerCase())) ||
                        (c.username && route.name.toLowerCase().includes(c.username.toLowerCase())) ||
                        (c.id && route.name.toLowerCase().includes(c.id.toLowerCase()))
                    );
                    if (matchedConsumer) {
                        consumer = matchedConsumer;
                        console.log('通过名称匹配找到消费者:', consumer);
                    }
                }
                
                // 方式5：如果所有方式都没找到，但有消费者数据，使用第一个消费者作为默认
                if (!consumer && this.consumersData && this.consumersData.length > 0) {
                    consumer = this.consumersData[0];
                    console.log('使用默认消费者:', consumer);
                }

                // 添加调试信息
                console.log(`=== 构建访问链路: ${route.name || route.id} ===`);
                console.log('路由数据:', route);
                console.log('关联服务:', service);
                console.log('关联上游:', upstream);
                console.log('关联消费者:', consumer);
                if (consumer) {
                    console.log('消费者插件:', consumer.plugins);
                    console.log('消费者插件类型:', typeof consumer.plugins);
                    console.log('消费者插件键:', Object.keys(consumer.plugins || {}));
                }
                console.log('消费者数据:', this.consumersData);
                console.log('路由插件:', route.plugins);
                
                chains.push({
                    route: route,
                    service: service,
                    upstream: upstream,
                    consumer: consumer,
                    plugins: route.plugins || {}
                });
            });
        }

        // 如果没有路由数据，也要显示空的链路结构
        if (chains.length === 0) {
            chains.push({
                route: null,
                service: null,
                upstream: null,
                consumer: null,
                plugins: {}
            });
        }

        // 添加调试信息
        console.log('=== 访问链路构建完成 ===');
        console.log('总链路数:', chains.length);
        console.log('消费者数据总数:', this.consumersData ? this.consumersData.length : 0);
        console.log('路由数据总数:', this.routesData ? this.routesData.length : 0);
        console.log('服务数据总数:', this.servicesData ? this.servicesData.length : 0);
        console.log('上游数据总数:', this.upstreamsData ? this.upstreamsData.length : 0);
        
        return chains;
    }

    // 渲染插件归属单元格
    renderPluginOwnershipCell(chain, type) {
        let plugins = [];
        
        switch(type) {
            case 'consumer':
                console.log('=== 渲染消费者插件 ===');
                console.log('链路数据:', chain);
                console.log('消费者数据:', chain.consumer);
                if (chain.consumer) {
                    console.log('消费者插件:', chain.consumer.plugins);
                    console.log('消费者插件类型:', typeof chain.consumer.plugins);
                    console.log('消费者插件键:', Object.keys(chain.consumer.plugins || {}));
                }
                if (chain.consumer && chain.consumer.plugins) {
                    plugins = Object.keys(chain.consumer.plugins);
                    console.log('找到的消费者插件:', plugins);
                }
                break;
            case 'route':
                if (chain.plugins) {
                    plugins = Object.keys(chain.plugins);
                }
                break;
            case 'service':
                if (chain.service && chain.service.plugins) {
                    plugins = Object.keys(chain.service.plugins);
                }
                break;
            case 'upstream':
                if (chain.upstream && chain.upstream.plugins) {
                    plugins = Object.keys(chain.upstream.plugins);
                }
                break;
        }
        
        if (plugins.length === 0) {
            return '<small class="text-muted">无插件</small>';
        }
        
        return `
            <div class="plugin-ownership-info">
                ${plugins.map(pluginName => 
                    `<span class="badge bg-light text-dark me-1 mb-1 d-inline-block" style="font-size: 0.7rem;">${pluginName}</span>`
                ).join('')}
            </div>
        `;
    }

    // 显示访问链路的完整JSON配置
    showChainJSON(index) {
        const chainDataElement = document.getElementById(`chain-data-${index}`);
        if (!chainDataElement) {
            console.error('找不到链路数据元素:', index);
            return;
        }

        try {
            const chainData = JSON.parse(chainDataElement.value);
            
            // 创建模态框显示JSON
            const modalId = `chain-json-modal-${index}`;
            const modalHTML = `
                <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="${modalId}-label">
                                    <i class="mdi mdi-code-json me-2"></i>访问链路完整配置 (链路 ${index + 1})
                                </h5>
                                <button type="button" class="btn-close" onclick="window.apisixAdmin.closeChainModal(${index})" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <div class="card">
                                    <div class="card-header">
                                        <h6 class="mb-0">
                                            <i class="mdi mdi-code-json me-2"></i>完整JSON配置
                                        </h6>
                                    </div>
                                    <div class="card-body">
                                        <pre class="bg-light p-3 rounded" style="max-height: 500px; overflow-y: auto; font-size: 0.85rem;">${JSON.stringify(chainData, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="window.apisixAdmin.closeChainModal(${index})">关闭</button>
                                <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.copyChainJSON(${index})">
                                    <i class="mdi mdi-content-copy me-1"></i>复制JSON
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // 移除已存在的模态框
            const existingModal = document.getElementById(modalId);
            if (existingModal) {
                existingModal.remove();
            }

            // 添加新模态框到页面
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // 显示模态框
            const modalElement = document.getElementById(modalId);
            const modal = new bootstrap.Modal(modalElement);
            modal.show();

            // 添加ESC键关闭功能
            const handleEscKey = (event) => {
                if (event.key === 'Escape') {
                    window.apisixAdmin.closeChainModal(index);
                    document.removeEventListener('keydown', handleEscKey);
                }
            };
            document.addEventListener('keydown', handleEscKey);

            // 添加点击背景关闭功能
            modalElement.addEventListener('click', (event) => {
                if (event.target === modalElement) {
                    window.apisixAdmin.closeChainModal(index);
                }
            });

        } catch (error) {
            console.error('解析链路数据失败:', error);
            alert('显示配置信息失败，请检查数据格式');
        }
    }

    // 关闭链路模态框
    closeChainModal(index) {
        const modalId = `chain-json-modal-${index}`;
        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            // 尝试多种方式关闭模态框
            try {
                // 方法1：尝试使用Bootstrap 5的getInstance方法
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal && typeof bootstrap.Modal.getInstance === 'function') {
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                        return;
                    }
                }
                
                // 方法2：尝试使用jQuery（如果可用）
                if (typeof $ !== 'undefined' && $.fn.modal) {
                    $(modalElement).modal('hide');
                    return;
                }
                
                // 方法3：直接操作DOM关闭模态框
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
                document.body.classList.remove('modal-open');
                
                // 移除背景遮罩
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
                
                // 移除body的modal-open类
                document.body.classList.remove('modal-open');
                
            } catch (error) {
                console.warn('关闭模态框失败，使用备用方案:', error);
                // 备用方案：直接移除元素
                modalElement.remove();
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
                document.body.classList.remove('modal-open');
            }
        }
    }

    // 复制链路JSON配置到剪贴板
    copyChainJSON(index) {
        const chainDataElement = document.getElementById(`chain-data-${index}`);
        if (!chainDataElement) {
            console.error('找不到链路数据元素:', index);
            return;
        }

        try {
            const chainData = JSON.parse(chainDataElement.value);
            const jsonString = JSON.stringify(chainData, null, 2);
            
            navigator.clipboard.writeText(jsonString).then(() => {
                // 显示成功提示
                const toastHTML = `
                    <div class="toast align-items-center text-white bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
                        <div class="d-flex">
                            <div class="toast-body">
                                <i class="mdi mdi-check-circle me-2"></i>JSON配置已复制到剪贴板
                            </div>
                            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                        </div>
                    </div>
                `;
                
                // 创建toast容器（如果不存在）
                let toastContainer = document.getElementById('toast-container');
                if (!toastContainer) {
                    toastContainer = document.createElement('div');
                    toastContainer.id = 'toast-container';
                    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
                    toastContainer.style.zIndex = '9999';
                    document.body.appendChild(toastContainer);
                }
                
                toastContainer.insertAdjacentHTML('beforeend', toastHTML);
                const toastElement = toastContainer.lastElementChild;
                const toast = new bootstrap.Toast(toastElement);
                toast.show();
                
                // 自动移除toast元素
                setTimeout(() => {
                    if (toastElement && toastElement.parentNode) {
                        toastElement.remove();
                    }
                }, 3000);
                
            }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请手动复制');
            });
            
        } catch (error) {
            console.error('复制链路数据失败:', error);
            alert('复制失败，请检查数据格式');
        }
    }

    // 加载消费管理页面内容
    loadConsumersContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- 顶部工具栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h4 class="card-title mb-1">消费管理</h4>
                                    <p class="text-muted mb-0">管理第三方系统的API访问权限和认证</p>
                                </div>
                                <div class="d-flex flex-wrap">
                                    <button class="btn btn-outline-secondary" style="margin-right: 20px;" onclick="window.apisixAdmin.refreshConsumers()">
                                        <i class="mdi mdi-refresh me-1"></i>刷新
                                    </button>
                                    <button class="btn btn-primary" onclick="window.apisixAdmin.createConsumer()">
                                        <i class="mdi mdi-plus me-1"></i>新建消费者
                                    </button>
                                </div>
                            </div>

                            <!-- 搜索 -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="mdi mdi-magnify"></i></span>
                                        <input type="text" class="form-control" id="consumer-search" placeholder="搜索系统名称、应用名称或认证类型...">
                                    </div>
                                </div>
                            </div>

                            <!-- 统计卡片 -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-left-primary">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">接入系统数</h6>
                                                    <h4 class="mb-0" id="total-consumers">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-account-group mdi-24px text-primary"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-success">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">活跃系统</h6>
                                                    <h4 class="mb-0" id="enabled-consumers">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-check-circle mdi-24px text-success"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-warning">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">暂停系统</h6>
                                                    <h4 class="mb-0" id="disabled-consumers">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-pause-circle mdi-24px text-warning"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-info">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">认证插件</h6>
                                                    <h4 class="mb-0" id="auth-plugins">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-shield-key mdi-24px text-info"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                            
                            <!-- 消费者列表 -->
                            <div class="table-responsive">
                                <table class="table table-hover" id="consumers-table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="sortable" data-sort="id" style="cursor: pointer;">
                                                ID <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="username" style="cursor: pointer;">
                                                用户名 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="desc" style="cursor: pointer;">
                                                描述 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="authType" style="cursor: pointer;">
                                                认证类型 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="plugins" style="cursor: pointer;">
                                                认证插件 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="authInfo" style="cursor: pointer;">
                                                认证信息 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="status" style="cursor: pointer;">
                                                状态 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th class="sortable" data-sort="createTime" style="cursor: pointer;">
                                                创建时间 <i class="mdi mdi-sort"></i>
                                            </th>
                                            <th style="width: 150px;">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="consumers-tbody">
                                        <!-- 消费者数据将在这里显示 -->
                                    </tbody>
                                </table>
                            </div>

                            <!-- 分页 -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted">
                                    显示 <span id="consumers-start">0</span> 到 <span id="consumers-end">0</span> 条，共 <span id="consumers-total">0</span> 条记录
                                </div>
                                <nav aria-label="消费者分页">
                                    <ul class="pagination pagination-sm mb-0" id="consumers-pagination">
                                        <!-- 分页将通过JavaScript动态生成 -->
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 新建/编辑消费者模态框 -->
            <div class="modal fade" id="consumerModal" tabindex="-1" aria-labelledby="consumerModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen-lg-down modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title" id="consumerModalLabel">
                                <i class="mdi mdi-plus-circle me-2"></i>新建消费者
                            </h5>
                            <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal" aria-label="Close" style="font-size: 1.5rem; line-height: 1; text-decoration: none;">
                                <i class="mdi mdi-close"></i>
                            </button>
                        </div>
                        <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
                            <form id="consumer-form">
                                <!-- 基本信息 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>基本信息</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="consumer-username" class="form-label fw-bold">用户名 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="consumer-username" placeholder="如：移动端APP、Web前端、合作伙伴系统" required>
                                                    <div class="form-text">消费者的名称标识</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="consumer-id" class="form-label fw-bold">ID</label>
                                                    <input type="text" class="form-control" id="consumer-id" placeholder="留空自动生成">
                                                    <div class="form-text">消费者的唯一标识符，留空将自动生成</div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="row">
                                            <div class="col-md-12">
                                                <div class="mb-3">
                                                    <label for="consumer-desc" class="form-label fw-bold">描述信息</label>
                                                    <textarea class="form-control" id="consumer-desc" rows="3" placeholder="如：移动端iOS应用、合作伙伴订单系统"></textarea>
                                                    <div class="form-text">消费者的详细描述信息</div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                    </div>
                                </div>

                                <!-- 认证配置 -->


                                <!-- 访问控制 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0"><i class="mdi mdi-account-key me-2"></i>访问控制</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="consumer-status" class="form-label fw-bold">状态</label>
                                                    <select class="form-select custom-select" id="consumer-status" style="font-size: 0.8rem;">
                                                        <option value="active">启用</option>
                                                        <option value="inactive">禁用</option>
                                                    </select>
                                                    <div class="form-text">消费者的当前状态</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="consumer-create-time" class="form-label fw-bold">创建时间</label>
                                                    <input type="datetime-local" class="form-control" id="consumer-create-time" readonly>
                                                    <div class="form-text">消费者创建时间，自动生成</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 插件配置 -->
                                <div class="card mb-3">
                                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                                        <h6 class="mb-0"><i class="mdi mdi-puzzle me-2"></i>插件配置</h6>
                                        <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.apisixAdmin.showConsumerPluginSelector()">
                                            <i class="mdi mdi-plus me-1"></i>选择插件
                                        </button>
                                    </div>
                                    <div class="card-body">
                                        <!-- 已选择的插件列表 -->
                                        <div id="selected-consumer-plugins" class="mb-3">
                                            <div class="text-muted text-center py-3">
                                                <i class="mdi mdi-information-outline me-1"></i>
                                                点击"选择插件"按钮为消费者添加插件配置
                                                </div>
                                            </div>
                                        
                                        <!-- 插件配置详情 -->
                                        <div id="consumer-plugin-configs" class="d-none">
                                            <h6 class="mb-3"><i class="mdi mdi-cog me-2"></i>插件配置详情</h6>
                                            <div id="consumer-plugin-config-list"></div>
                                        </div>
                                    </div>
                                </div>


                            </form>
                        </div>
                        <div class="modal-footer bg-light sticky-bottom">
                            <button type="button" class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelConsumer()">
                                <i class="mdi mdi-close me-1"></i>取消
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.saveConsumer()">
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 初始化消费管理功能
        this.initConsumersManagement();
    }

    // ==================== 消费管理功能 ====================

    // 初始化消费管理
    initConsumersManagement() {
        this.initConsumersData();
        this.bindConsumersEvents();
        this.updateConsumersStats();
    }

    // ==================== 消费者管理插件选择功能 ====================
    
    // 显示消费者插件选择器
    showConsumerPluginSelector() {
        // 获取当前消费者ID（编辑模式）
        const consumerId = document.getElementById('consumer-id').value;
        this.showPluginSelector('consumer', consumerId, (selectedPlugins) => {
            this.updateConsumerPluginSelection(selectedPlugins);
        });
    }
    
    // 更新消费者插件选择
    updateConsumerPluginSelection(selectedPlugins) {
        if (!selectedPlugins || selectedPlugins.length === 0) {
            // 清空选择
            document.getElementById('selected-consumer-plugins').innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="mdi mdi-information-outline me-1"></i>
                    点击"选择插件"按钮为消费者添加插件配置
                </div>
            `;
            document.getElementById('consumer-plugin-configs').classList.add('d-none');
            return;
        }
        
        // 显示已选择的插件
        const pluginsHtml = selectedPlugins.map(plugin => `
            <div class="alert alert-info alert-dismissible fade show mb-2" role="alert">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">
                            <i class="mdi mdi-puzzle me-2"></i>${plugin.plugin_name}
                        </div>
                        <p class="mb-1 small">${plugin.name || '默认配置'}</p>
                        <small class="text-muted">
                            创建时间: ${new Date(plugin.created_at).toLocaleString()}
                        </small>
                    </div>
                    <button type="button" class="btn-close" onclick="window.apisixAdmin.removeConsumerPlugin('${plugin.id}')"></button>
                </div>
            </div>
        `).join('');
        
        document.getElementById('selected-consumer-plugins').innerHTML = pluginsHtml;
        
        // 显示插件配置详情
        this.updateConsumerPluginConfigs(selectedPlugins);
        document.getElementById('consumer-plugin-configs').classList.remove('d-none');
    }
    
    // 更新消费者插件配置详情
    updateConsumerPluginConfigs(selectedPlugins) {
        const configList = document.getElementById('consumer-plugin-config-list');
        if (!configList) return;
        
        const configsHtml = selectedPlugins.map(plugin => {
            // 生成配置详情提示
            let configTips = '';
            if (plugin.plugin_name === 'key-auth' && plugin.config.key) {
                configTips = `
                    <div class="alert alert-warning mt-2">
                        <i class="mdi mdi-alert-circle me-2"></i>
                        <strong>API密钥:</strong> <code>${plugin.config.key}</code>
                        <br><small class="text-muted">客户端请求时使用此密钥进行认证</small>
                    </div>
                `;
            } else if (plugin.plugin_name === 'basic-auth' && plugin.config.username && plugin.config.password) {
                configTips = `
                    <div class="alert alert-info mt-2">
                        <i class="mdi mdi-account-key me-2"></i>
                        <strong>认证信息:</strong>
                        <br><strong>用户名:</strong> <code>${plugin.config.username}</code>
                        <br><strong>密码:</strong> <code>${plugin.config.password}</code>
                        <br><small class="text-muted">客户端请求时使用Basic Auth进行认证</small>
                    </div>
                `;
            } else if (plugin.plugin_name === 'jwt-auth' && plugin.config.secret) {
                configTips = `
                    <div class="alert alert-success mt-2">
                        <i class="mdi mdi-key-variant me-2"></i>
                        <strong>JWT密钥:</strong> <code>${plugin.config.secret}</code>
                        <br><small class="text-muted">用于JWT令牌的签名验证</small>
                    </div>
                `;
            } else if (plugin.plugin_name === 'hmac-auth' && plugin.config.access_key && plugin.config.secret_key) {
                configTips = `
                    <div class="alert alert-primary mt-2">
                        <i class="mdi mdi-fingerprint me-2"></i>
                        <strong>HMAC认证信息:</strong>
                        <br><strong>Access Key:</strong> <code>${plugin.config.access_key}</code>
                        <br><strong>Secret Key:</strong> <code>${plugin.config.secret_key}</code>
                        <br><small class="text-muted">客户端请求时使用HMAC签名进行认证</small>
                    </div>
                `;
            }
            
            return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="mdi mdi-cog me-2"></i>${plugin.plugin_name} 配置
                    </h6>
                    <div>
                        <button class="btn btn-outline-success btn-sm me-2" type="button" onclick="window.apisixAdmin.togglePluginConfigEdit('${plugin.id}', 'consumer')">
                            <i class="mdi mdi-pencil me-1"></i>编辑配置
                        </button>
                        <button class="btn btn-primary btn-sm" type="button" onclick="window.apisixAdmin.savePluginConfigDirect('${plugin.id}', 'consumer')" style="display: none;" id="save-btn-${plugin.id}">
                            <i class="mdi mdi-content-save me-1"></i>保存
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="mb-2">
                        <textarea class="form-control" id="config-${plugin.id}" rows="8" style="font-family: monospace; font-size: 12px; width: 100%;" readonly>${JSON.stringify(plugin.config, null, 2)}</textarea>
                    </div>
                    ${configTips}
                </div>
            </div>
            `;
        }).join('');
        
        configList.innerHTML = configsHtml;
    }
    
    // 切换插件配置编辑模式
    togglePluginConfigEdit(pluginId, type) {
        const textarea = document.getElementById(`config-${pluginId}`);
        const editBtn = document.querySelector(`button[onclick*="togglePluginConfigEdit('${pluginId}', '${type}')"]`);
        const saveBtn = document.getElementById(`save-btn-${pluginId}`);
        
        if (!textarea || !editBtn || !saveBtn) return;
        
        if (textarea.readOnly) {
            // 进入编辑模式
            textarea.readOnly = false;
            textarea.style.backgroundColor = '#fff';
            textarea.style.borderColor = '#28a745';
            editBtn.style.display = 'none';
            saveBtn.style.display = 'inline-block';
            editBtn.innerHTML = '<i class="mdi mdi-eye me-1"></i>查看配置';
        } else {
            // 退出编辑模式
            textarea.readOnly = true;
            textarea.style.backgroundColor = '#f8f9fa';
            textarea.style.borderColor = '#dee2e6';
            editBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            editBtn.innerHTML = '<i class="mdi mdi-pencil me-1"></i>编辑配置';
        }
    }
    
    // 直接保存插件配置
    savePluginConfigDirect(pluginId, type) {
        const textarea = document.getElementById(`config-${pluginId}`);
        if (!textarea) return;
        
        try {
            const newConfig = JSON.parse(textarea.value);
            
            if (type === 'consumer') {
                const plugin = this.currentConsumerPlugins.find(p => p.id === pluginId);
                if (plugin) {
                    plugin.config = newConfig;
                    this.showNotification('消费者插件配置已保存', 'success');
                }
            } else if (type === 'service') {
                const plugin = this.currentServicePlugins.find(p => p.id === pluginId);
                if (plugin) {
                    plugin.config = newConfig;
                    this.showNotification('服务插件配置已保存', 'success');
                }
            }
            
            // 退出编辑模式
            this.togglePluginConfigEdit(pluginId, type);
            
        } catch (error) {
            this.showNotification('JSON格式错误，请检查配置', 'error');
            console.error('JSON解析错误:', error);
        }
    }
    
    // 编辑消费者插件配置（保留兼容性）
    editConsumerPluginConfig(pluginId) {
        const plugin = this.currentConsumerPlugins.find(p => p.id === pluginId);
        if (!plugin) return;
        
        // 显示插件配置编辑模态框
        this.showPluginConfigEditor('consumer', plugin);
    }
    
    // 移除消费者插件
    removeConsumerPlugin(pluginId) {
        if (!this.currentConsumerPlugins) return;
        
        // 从当前选择中移除插件
        this.currentConsumerPlugins = this.currentConsumerPlugins.filter(p => p.id !== pluginId);
        
        // 更新UI显示
        this.updateConsumerPluginSelection(this.currentConsumerPlugins);
        
        this.showNotification('插件已移除', 'success');
    }
    
    // 重置消费者插件选择状态
    resetConsumerPluginSelection() {
        // 清空插件选择
        this.currentConsumerPlugins = [];
        
        // 重置UI显示
        document.getElementById('selected-consumer-plugins').innerHTML = `
            <div class="text-muted text-center py-3">
                <i class="mdi mdi-information-outline me-1"></i>
                点击"选择插件"按钮为消费者添加插件配置
            </div>
        `;
        document.getElementById('consumer-plugin-configs').classList.add('d-none');
    }

    // 显示插件配置编辑器
    showPluginConfigEditor(type, plugin) {
        const modalId = 'plugin-config-editor-modal';
        
        // 移除已存在的模态框
        const existingModal = document.getElementById(modalId);
        if (existingModal) {
            existingModal.remove();
        }
        
        // 移除可能存在的背景遮罩
        const existingBackdrop = document.querySelector('.modal-backdrop');
        if (existingBackdrop) {
            existingBackdrop.remove();
        }
        
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1" style="z-index: 9999;">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="mdi mdi-cog me-2"></i>编辑插件配置 - ${plugin.plugin_name}
                            </h5>
                            <button type="button" class="btn-close text-white" onclick="window.apisixAdmin.closePluginConfigEditor()"></button>
                        </div>
                        <div class="modal-body">
                            <form id="plugin-config-form">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">插件名称</label>
                                    <input type="text" class="form-control" value="${plugin.plugin_name}" readonly>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label fw-bold">配置参数</label>
                                    <div id="plugin-config-fields">
                                        ${this.generatePluginConfigFields(plugin)}
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="window.apisixAdmin.closePluginConfigEditor()">取消</button>
                            <button type="button" class="btn btn-info" onclick="window.apisixAdmin.savePluginConfig('${type}', '${plugin.id}')">
                                保存配置
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 添加新模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 手动显示模态框
        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.classList.add('show');
            modalElement.style.display = 'block';
            document.body.classList.add('modal-open');
            
            // 添加背景遮罩
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            backdrop.style.zIndex = '9998';
            document.body.appendChild(backdrop);
            
            // 点击背景关闭模态框
            backdrop.addEventListener('click', () => {
                this.closePluginConfigEditor();
            });
        }
        
        console.log('插件配置编辑器已显示:', modalId);
    }
    
    // 生成插件配置字段
    generatePluginConfigFields(plugin) {
        if (!plugin.config || typeof plugin.config !== 'object') {
            return '<div class="text-muted">该插件没有配置参数</div>';
        }
        
        let fieldsHTML = '';
        for (const [key, value] of Object.entries(plugin.config)) {
            const fieldType = this.getFieldType(value);
            const fieldValue = typeof value === 'string' ? value : JSON.stringify(value);
            
            fieldsHTML += `
                <div class="mb-3">
                    <label class="form-label fw-bold">${key}</label>
                    ${this.generateFieldInput(key, fieldType, fieldValue)}
                    <div class="form-text">配置参数: ${key}</div>
                </div>
            `;
        }
        
        return fieldsHTML;
    }
    
    // 获取字段类型
    getFieldType(value) {
        if (typeof value === 'boolean') return 'checkbox';
        if (typeof value === 'number') return 'number';
        if (Array.isArray(value)) return 'textarea';
        return 'text';
    }
    
    // 生成字段输入框
    generateFieldInput(key, type, value) {
        switch (type) {
            case 'checkbox':
                return `<input type="checkbox" class="form-check-input" id="config-${key}" ${value === 'true' || value === true ? 'checked' : ''}>`;
            case 'number':
                return `<input type="number" class="form-control" id="config-${key}" value="${value}">`;
            case 'textarea':
                return `<textarea class="form-control" id="config-${key}" rows="3">${value}</textarea>`;
            default:
                return `<input type="text" class="form-control" id="config-${key}" value="${value}">`;
        }
    }
    
    // 保存插件配置
    savePluginConfig(type, pluginId) {
        const form = document.getElementById('plugin-config-form');
        if (!form) return;
        
        // 收集配置数据
        const config = {};
        const plugin = type === 'consumer' ? 
            this.currentConsumerPlugins.find(p => p.id === pluginId) :
            this.currentServicePlugins.find(p => p.id === pluginId);
            
        if (!plugin) return;
        
        // 从表单收集配置值
        for (const [key, value] of Object.entries(plugin.config)) {
            const fieldId = `config-${key}`;
            const field = document.getElementById(fieldId);
            if (field) {
                if (field.type === 'checkbox') {
                    config[key] = field.checked;
                } else if (field.type === 'number') {
                    config[key] = parseFloat(field.value) || 0;
                } else if (field.type === 'textarea') {
                    try {
                        config[key] = JSON.parse(field.value);
                    } catch {
                        config[key] = field.value;
                    }
                } else {
                    config[key] = field.value;
                }
            }
        }
        
        // 更新插件配置
        plugin.config = config;
        
        // 更新UI显示
        if (type === 'consumer') {
            this.updateConsumerPluginSelection(this.currentConsumerPlugins);
        } else {
            this.updateServicePluginSelection(this.currentServicePlugins);
        }
        
        // 关闭模态框
        this.closePluginConfigEditor();
        
        this.showNotification('插件配置已更新', 'success');
    }
    
    // 关闭插件配置编辑器
    closePluginConfigEditor() {
        console.log('正在关闭插件配置编辑器...');
        
        const modalElement = document.getElementById('plugin-config-editor-modal');
        if (modalElement) {
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            
            // 移除模态框元素
            modalElement.remove();
        }
        
        // 移除所有背景遮罩
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => {
            backdrop.remove();
        });
        
        console.log('插件配置编辑器已关闭');
    }

    // ==================== 消费者认证配置辅助功能 ====================
    
    // 生成随机字符串（用于生成API密钥）
    generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // ==================== 证书管理（SSL）功能 ====================

    // 加载证书管理页面内容
    loadSSLContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <!-- 顶部工具栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div>
                                    <h4 class="card-title mb-1">证书管理</h4>
                                    <p class="text-muted mb-0">管理网关的TLS证书与SNI绑定</p>
                                </div>
                                <div class="d-flex flex-wrap">
                                    <button class="btn btn-outline-secondary" style="margin-right: 20px;" onclick="window.apisixAdmin.refreshSSLs()">
                                        <i class="mdi mdi-refresh me-1"></i>刷新
                                    </button>
                                    <button class="btn btn-primary" onclick="window.apisixAdmin.createSSL()">
                                        <i class="mdi mdi-plus me-1"></i>新建证书
                                    </button>
                                </div>
                            </div>

                            <!-- 搜索 -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="mdi mdi-magnify"></i></span>
                                        <input type="text" class="form-control" id="ssl-search" placeholder="搜索证书ID、SNI域名...">
                                    </div>
                                </div>
                            </div>

                            <!-- 统计卡片 -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="card border-left-primary">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">证书总数</h6>
                                                    <h4 class="mb-0" id="total-ssl">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-lock mdi-24px text-primary"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-success">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">有效证书</h6>
                                                    <h4 class="mb-0" id="valid-ssl">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-check-circle mdi-24px text-success"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-warning">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">即将过期</h6>
                                                    <h4 class="mb-0" id="expiring-ssl">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-timer-sand mdi-24px text-warning"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card border-left-danger">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between">
                                                <div>
                                                    <h6 class="text-muted">已过期</h6>
                                                    <h4 class="mb-0" id="expired-ssl">0</h4>
                                                </div>
                                                <div class="align-self-center">
                                                    <i class="mdi mdi-alert-circle mdi-24px text-danger"></i>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 证书列表 -->
                            <div class="table-responsive">
                                <table class="table table-hover" id="ssl-table">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="sortable" data-sort="id" style="cursor: pointer;">证书ID <i class="mdi mdi-sort"></i></th>
                                            <th class="sortable" data-sort="snis" style="cursor: pointer;">SNI域名 <i class="mdi mdi-sort"></i></th>
                                            <th class="sortable" data-sort="expireAt" style="cursor: pointer;">到期时间 <i class="mdi mdi-sort"></i></th>
                                            <th class="sortable" data-sort="status" style="cursor: pointer;">状态 <i class="mdi mdi-sort"></i></th>
                                            <th class="sortable" data-sort="createTime" style="cursor: pointer;">创建时间 <i class="mdi mdi-sort"></i></th>
                                            <th style="width: 120px;">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ssl-tbody"></tbody>
                                </table>
                            </div>

                            <!-- 分页 -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div class="text-muted">
                                    显示 <span id="ssl-start">0</span> 到 <span id="ssl-end">0</span> 条，共 <span id="ssl-total">0</span> 条记录
                                </div>
                                <nav aria-label="证书分页">
                                    <ul class="pagination pagination-sm mb-0" id="ssl-pagination"></ul>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 新建/编辑证书模态框 -->
            <div class="modal fade" id="sslModal" tabindex="-1" aria-labelledby="sslModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="sslModalLabel"><i class="mdi mdi-plus-circle me-2"></i>新建证书</h5>
                        </div>
                        <div class="modal-body">
                            <form id="ssl-form">
                                <!-- 基本信息 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>基本信息</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="ssl-id" class="form-label fw-bold">证书ID</label>
                                                    <input type="text" class="form-control" id="ssl-id" placeholder="留空自动生成">
                                                    <div class="form-text">证书唯一标识，留空将自动生成</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="ssl-snis" class="form-label fw-bold">SNI域名 <span class="text-danger">*</span></label>
                                                    <input type="text" class="form-control" id="ssl-snis" placeholder="多个域名用逗号分隔，如: api.example.com, *.example.com" required>
                                                    <div class="form-text">与证书绑定的域名列表</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="ssl-expireAt" class="form-label fw-bold">到期日期 <span class="text-danger">*</span></label>
                                                    <input type="date" class="form-control" id="ssl-expireAt" required>
                                                    <div class="form-text">证书有效期截止日期</div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-check mb-3 mt-4">
                                                    <input class="form-check-input" type="checkbox" id="ssl-enabled" checked>
                                                    <label class="form-check-label fw-bold" for="ssl-enabled"><i class="mdi mdi-check-circle me-1"></i>创建后立即启用</label>
                                                    <div class="form-text">创建后立即启用此证书</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 证书内容 -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="mdi mdi-certificate-outline me-2"></i>PEM内容</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="ssl-cert" class="form-label fw-bold">证书 (PEM) <span class="text-danger">*</span></label>
                                                    <textarea class="form-control" id="ssl-cert" rows="6" placeholder="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----" required></textarea>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="mb-3">
                                                    <label for="ssl-key" class="form-label fw-bold">私钥 (PEM) <span class="text-danger">*</span></label>
                                                    <textarea class="form-control" id="ssl-key" rows="6" placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----" required></textarea>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelSSL()"><i class="mdi mdi-close me-1"></i>取消</button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.saveSSL()">保存</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.initSSLManagement();
    }

    // 初始化证书管理
    initSSLManagement() {
        this.initSSLData();
        this.bindSSLEvents();
        this.updateSSLsStats();
    }

    // 初始化证书数据
    initSSLData() {
        // 如果还没有数据，则初始化为空数组
        if (!this.sslData || this.sslData.length === 0) {
            this.sslData = [];
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displaySSLsWithPagination(this.sslData);
        this.updateSSLsStats();
    }

    // 显示证书列表（带分页）
    displaySSLsWithPagination(items) {
        const tbody = document.getElementById('ssl-tbody');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        <i class="mdi mdi-lock mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无证书数据</p>
                    </td>
                </tr>
            `;
            this.updateSSLsPagination(0);
            return;
        }

        const totalPages = Math.ceil(items.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, items.length);
        const current = items.slice(startIndex, endIndex);

        tbody.innerHTML = current.map(ssl => {
            // 到期时间徽章颜色
            const today = new Date();
            const expireDate = new Date(ssl.expireAt);
            const diffDays = Math.ceil((expireDate - today) / (1000 * 60 * 60 * 24));
            let expireBadge = 'bg-success';
            if (diffDays <= 15 && diffDays >= 0) expireBadge = 'bg-warning';
            if (diffDays < 0) expireBadge = 'bg-danger';

            return `
                <tr>
                    <td><code>${ssl.id}</code></td>
                    <td>${ssl.snis.map(s => `<span class="badge bg-light text-dark me-1">${s}</span>`).join('')}</td>
                    <td><span class="badge ${expireBadge}">${ssl.expireAt}</span></td>
                    <td>
                        <span class="badge ${ssl.enabled ? 'bg-success' : 'bg-warning'}">${ssl.enabled ? '已启用' : '已禁用'}</span>
                    </td>
                    <td>${ssl.createTime}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="window.apisixAdmin.editSSL('${ssl.id}')" title="编辑"><i class="mdi mdi-pencil"></i></button>
                            <button class="btn btn-outline-info" onclick="window.apisixAdmin.viewSSL('${ssl.id}')" title="预览"><i class="mdi mdi-eye"></i></button>
                            <button class="btn btn-outline-${ssl.enabled ? 'warning' : 'success'}" onclick="window.apisixAdmin.toggleSSLStatus('${ssl.id}')" title="${ssl.enabled ? '禁用' : '启用'}"><i class="mdi mdi-${ssl.enabled ? 'pause' : 'play'}"></i></button>
                            <button class="btn btn-outline-danger" onclick="window.apisixAdmin.deleteSSL('${ssl.id}')" title="删除"><i class="mdi mdi-delete"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.updateSSLsPagination(items.length, totalPages, startIndex + 1, endIndex);
    }

    // 更新证书分页
    updateSSLsPagination(totalItems, totalPages, startItem, endItem) {
        const pagination = document.getElementById('ssl-pagination');
        const startSpan = document.getElementById('ssl-start');
        const endSpan = document.getElementById('ssl-end');
        const totalSpan = document.getElementById('ssl-total');

        if (startSpan) startSpan.textContent = startItem || 0;
        if (endSpan) endSpan.textContent = endItem || 0;
        if (totalSpan) totalSpan.textContent = totalItems || 0;
        if (!pagination) return;

        let html = '';
        html += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToSSLPage(${this.currentPage - 1})"><i class="mdi mdi-chevron-left"></i></a>
            </li>`;
        const pages = Math.ceil((totalItems || 0) / this.pageSize) || 1;
        for (let i = 1; i <= pages; i++) {
            html += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="window.apisixAdmin.goToSSLPage(${i})">${i}</a>
                </li>`;
        }
        html += `
            <li class="page-item ${this.currentPage === pages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToSSLPage(${this.currentPage + 1})"><i class="mdi mdi-chevron-right"></i></a>
            </li>`;

        pagination.innerHTML = html;
    }

    goToSSLPage(page) {
        const pages = Math.ceil((this.sslData?.length || 0) / this.pageSize) || 1;
        this.currentPage = Math.max(1, Math.min(page, pages));
        this.displaySSLsWithPagination(this.sslData || []);
    }

    // 统计卡片
    updateSSLsStats() {
        const totalEl = document.getElementById('total-ssl');
        const validEl = document.getElementById('valid-ssl');
        const expiringEl = document.getElementById('expiring-ssl');
        const expiredEl = document.getElementById('expired-ssl');
        const data = this.sslData || [];

        const now = new Date();
        let valid = 0, expiring = 0, expired = 0;
        data.forEach(ssl => {
            const d = new Date(ssl.expireAt);
            const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
            if (diff < 0) expired += 1;
            else if (diff <= 15) expiring += 1;
            else valid += 1;
        });

        if (totalEl) totalEl.textContent = data.length;
        if (validEl) validEl.textContent = valid;
        if (expiringEl) expiringEl.textContent = expiring;
        if (expiredEl) expiredEl.textContent = expired;
    }

    // 事件与排序
    bindSSLEvents() {
        const search = document.getElementById('ssl-search');
        if (search) {
            search.addEventListener('input', () => this.filterSSLs());
        }
        this.bindSSLSorting();
    }

    bindSSLSorting() {
        const table = document.getElementById('ssl-table');
        if (!table) return;
        table.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const sortField = th.getAttribute('data-sort');
                this.sortSSLs(sortField);
            });
        });
    }

    sortSSLs(sortField) {
        if (!this.sslData) return;
        if (!this.currentSortField || this.currentSortField !== sortField) {
            this.currentSortField = sortField;
            this.currentSortDirection = 'asc';
        } else {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        }

        const sorted = [...this.sslData].sort((a, b) => {
            let va = a[sortField];
            let vb = b[sortField];
            if (sortField === 'snis') {
                va = (a.snis || []).join(',');
                vb = (b.snis || []).join(',');
            }
            if (sortField === 'expireAt' || sortField === 'createTime') {
                return (new Date(va) - new Date(vb)) * (this.currentSortDirection === 'asc' ? 1 : -1);
            }
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return this.currentSortDirection === 'asc' ? -1 : 1;
            if (va > vb) return this.currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.displaySSLsWithPagination(sorted);
        this.updateSortIcons('ssl-table', sortField, this.currentSortDirection);
    }

    filterSSLs() {
        const input = document.getElementById('ssl-search');
        if (!input) return;
        const term = input.value.trim().toLowerCase();
        if (!term) {
            this.currentPage = 1;
            this.displaySSLsWithPagination(this.sslData || []);
            return;
        }
        const filtered = (this.sslData || []).filter(ssl =>
            (ssl.id || '').toLowerCase().includes(term) ||
            (ssl.snis || []).join(',').toLowerCase().includes(term)
        );
        this.currentPage = 1;
        this.displaySSLsWithPagination(filtered);
    }

    // CRUD
    createSSL() {
        document.getElementById('sslModalLabel').innerHTML = '<i class="mdi mdi-plus-circle me-2"></i>新建证书';
        const form = document.getElementById('ssl-form');
        if (form) form.reset();
        document.getElementById('ssl-id').value = '';
        document.getElementById('ssl-enabled').checked = true;
        const modal = new bootstrap.Modal(document.getElementById('sslModal'));
        modal.show();
    }

    editSSL(sslId) {
        const ssl = (this.sslData || []).find(s => s.id === sslId);
        if (!ssl) { this.showNotification('证书不存在', 'error'); return; }
        document.getElementById('sslModalLabel').innerHTML = '<i class="mdi mdi-pencil me-2"></i>编辑证书';
        document.getElementById('ssl-id').value = ssl.id;
        document.getElementById('ssl-snis').value = (ssl.snis || []).join(', ');
        document.getElementById('ssl-expireAt').value = ssl.expireAt;
        document.getElementById('ssl-cert').value = ssl.cert || '';
        document.getElementById('ssl-key').value = ssl.key || '';
        document.getElementById('ssl-enabled').checked = !!ssl.enabled;
        const modal = new bootstrap.Modal(document.getElementById('sslModal'));
        modal.show();
    }

    viewSSL(sslId) {
        const ssl = (this.sslData || []).find(s => s.id === sslId);
        if (!ssl) { this.showNotification('证书不存在', 'error'); return; }
        this.showSSLDetailsModal(ssl);
    }

    showSSLDetailsModal(ssl) {
        const modalHTML = `
            <div class="modal fade" id="sslDetailsModal" tabindex="-1" aria-labelledby="sslDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="sslDetailsModalLabel"><i class="mdi mdi-eye me-2"></i>证书配置预览</h5>
                        </div>
                        <div class="modal-body p-0">
                            <pre class="bg-dark text-light p-4 m-0" style="font-size: 0.9rem; max-height: 70vh; overflow-y: auto; border-radius: 0;"><code>${JSON.stringify(ssl, null, 2)}</code></pre>
                        </div>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('sslDetailsModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = new bootstrap.Modal(document.getElementById('sslDetailsModal'), { backdrop: true, keyboard: true });
        modal.show();
        document.getElementById('sslDetailsModal').addEventListener('hidden.bs.modal', function() { this.remove(); });
    }

    toggleSSLStatus(sslId) {
        const ssl = (this.sslData || []).find(s => s.id === sslId);
        if (!ssl) { this.showNotification('证书不存在', 'error'); return; }
        const newEnabled = !ssl.enabled;
        const action = newEnabled ? '启用' : '禁用';
        this.showConfirm(`确定要${action}证书 "${ssl.id}" 吗？`, () => {
            ssl.enabled = newEnabled;
            this.currentPage = 1;
            this.displaySSLsWithPagination(this.sslData);
            this.updateSSLsStats();
            this.showNotification(`证书已${action}`, 'success');
        });
    }

    deleteSSL(sslId) {
        const ssl = (this.sslData || []).find(s => s.id === sslId);
        if (!ssl) { this.showNotification('证书不存在', 'error'); return; }
        this.showConfirm(`确定要删除证书 "${ssl.id}" 吗？此操作不可恢复！`, () => {
            this.sslData = (this.sslData || []).filter(s => s.id !== sslId);
        
        // 保存到本地存储
        this.saveToStorage('ssl', this.sslData);
        
            this.currentPage = 1;
            this.displaySSLsWithPagination(this.sslData);
            this.updateSSLsStats();
            this.showNotification('证书已删除', 'success');
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }

    saveSSL() {
        const form = document.getElementById('ssl-form');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const id = document.getElementById('ssl-id').value || `ssl-${Date.now()}`;
        const snis = document.getElementById('ssl-snis').value.split(',').map(s => s.trim()).filter(Boolean);
        const expireAt = document.getElementById('ssl-expireAt').value;
        const cert = document.getElementById('ssl-cert').value.trim();
        const key = document.getElementById('ssl-key').value.trim();
        const enabled = document.getElementById('ssl-enabled').checked;

        const sslData = { id, snis, expireAt, cert, key, enabled, createTime: new Date().toLocaleString('zh-CN') };

        const idx = (this.sslData || []).findIndex(s => s.id === id);
        if (idx >= 0) {
            this.sslData[idx] = { ...this.sslData[idx], ...sslData };
            this.showNotification('证书已更新', 'success');
        } else {
            (this.sslData || (this.sslData = [])).push(sslData);
            this.showNotification('证书已创建', 'success');
        }

        // 保存到本地存储
        this.saveToStorage('ssl', this.sslData);

        this.currentPage = 1;
        this.displaySSLsWithPagination(this.sslData);
        this.updateSSLsStats();

        // 关闭模态框
        const modalElement = document.getElementById('sslModal');
        if (modalElement) {
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
        }
    }

    cancelSSL() {
        const modalElement = document.getElementById('sslModal');
        if (modalElement) {
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
        }
        this.showNotification('操作已取消', 'info');
    }

    refreshSSLs() {
        this.showNotification('正在刷新证书数据...', 'info');
        setTimeout(() => {
            this.currentPage = 1;
            this.initSSLData();
            this.updateSSLsStats();
            this.showNotification('证书数据已刷新', 'success');
        }, 800);
    }

    // 初始化消费数据
    initConsumersData() {
        // 如果还没有数据，则初始化为空数组
        if (!this.consumersData || this.consumersData.length === 0) {
            this.consumersData = [];
            // 数据为空时自动刷新
            console.log('消费者数据为空，自动刷新...');
            setTimeout(() => {
                this.refreshAPISIXData();
            }, 200);
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displayConsumersWithPagination(this.consumersData);
        this.updateConsumersStats();
    }

    // 显示消费者列表（带分页）
    displayConsumersWithPagination(consumers) {
        const tbody = document.getElementById('consumers-tbody');
        if (!tbody) return;
        
        console.log('=== 消费者列表显示调试信息 ===');
        console.log('显示消费者列表，数据:', consumers);
        console.log('消费者详细信息:', consumers.map(c => ({
            id: c.id, 
            username: c.username,
            authType: c.authType, 
            plugins: c.plugins,
            status: c.status,
            statusType: typeof c.status,
            desc: c.desc,
            create_time: c.create_time
        })));
        console.log('消费者状态字段:', consumers.map(c => ({id: c.id, status: c.status, statusType: typeof c.status})));
        
        if (consumers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        <i class="mdi mdi-account-group mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无消费者数据</p>
                    </td>
                </tr>
            `;
            this.updateConsumersPagination(0);
            return;
        }
        
        // 计算分页
        const totalPages = Math.ceil(consumers.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, consumers.length);
        const currentPageConsumers = consumers.slice(startIndex, endIndex);
        
        // 渲染当前页数据
        tbody.innerHTML = currentPageConsumers.map(consumer => `
            <tr>
                <td><code>${consumer.id}</code></td>
                <td>
                    <div>
                        <strong>${consumer.username}</strong>
                    </div>
                </td>
                <td>
                    <div class="text-truncate" style="max-width: 150px;" title="${consumer.desc || '无描述'}">
                        ${consumer.desc || '<span class="text-muted">无描述</span>'}
                    </div>
                </td>
                <td>
                    <span class="badge bg-info">${consumer.authType || '无认证'}</span>
                </td>
                <td>
                    ${consumer.plugins && typeof consumer.plugins === 'object' && Object.keys(consumer.plugins).length > 0 
                        ? Object.keys(consumer.plugins).map(plugin => {
                            let badgeClass = 'bg-primary';
                            if (plugin === 'key-auth') badgeClass = 'bg-warning';
                            else if (plugin === 'basic-auth') badgeClass = 'bg-info';
                            else if (plugin === 'jwt-auth') badgeClass = 'bg-success';
                            else if (plugin === 'oauth2') badgeClass = 'bg-secondary';
                            return `<span class="badge ${badgeClass} me-1">${plugin}</span>`;
                        }).join('') 
                        : '<span class="text-muted">无插件</span>'
                    }
                </td>
                <td>
                    ${this.renderConsumerAuthInfo(consumer)}
                </td>
                <td>
                    <span class="badge ${consumer.status === 'active' ? 'bg-success' : 'bg-warning'}">
                        ${consumer.status === 'active' ? '启用' : '禁用'}
                    </span>
                </td>
                <td>${consumer.createTime || consumer.create_time || '未知'}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.editConsumer('${consumer.id}')" title="编辑">
                            <i class="mdi mdi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="window.apisixAdmin.viewConsumer('${consumer.id}')" title="查看详情">
                            <i class="mdi mdi-eye"></i>
                        </button>
                        <button class="btn btn-outline-${consumer.status === 'active' ? 'warning' : 'success'}" 
                                onclick="window.apisixAdmin.toggleConsumerStatus('${consumer.id}')" 
                                title="${consumer.status === 'active' ? '禁用' : '启用'}">
                            <i class="mdi mdi-${consumer.status === 'active' ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="window.apisixAdmin.deleteConsumer('${consumer.id}')" title="删除">
                            <i class="mdi mdi-delete"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // 更新分页信息
        this.updateConsumersPagination(consumers.length, totalPages, startIndex + 1, endIndex);
    }

    // 更新消费者分页
    updateConsumersPagination(totalItems, totalPages, startItem, endItem) {
        const pagination = document.getElementById('consumers-pagination');
        const startSpan = document.getElementById('consumers-start');
        const endSpan = document.getElementById('consumers-end');
        const totalSpan = document.getElementById('consumers-total');
        
        if (startSpan) startSpan.textContent = startItem;
        if (endSpan) endSpan.textContent = endItem;
        if (totalSpan) totalSpan.textContent = totalItems;
        
        if (!pagination) return;
        
        let paginationHTML = '';
        
        // 上一页
        paginationHTML += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToConsumerPage(${this.currentPage - 1})">
                    <i class="mdi mdi-chevron-left"></i>
                </a>
            </li>
        `;
        
        // 页码
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="window.apisixAdmin.goToConsumerPage(${i})">${i}</a>
                </li>
            `;
        }
        
        // 下一页
        paginationHTML += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="window.apisixAdmin.goToConsumerPage(${this.currentPage + 1})">
                    <i class="mdi mdi-chevron-right"></i>
                </a>
            </li>
        `;
        
        pagination.innerHTML = paginationHTML;
    }

    // 跳转到消费者页面
    goToConsumerPage(page) {
        if (page < 1 || page > Math.ceil(this.consumersData.length / this.pageSize)) return;
        this.currentPage = page;
        this.displayConsumersWithPagination(this.consumersData);
    }

    // 渲染消费者认证信息
    renderConsumerAuthInfo(consumer) {
        if (!consumer.plugins || typeof consumer.plugins !== 'object') {
            return '<span class="text-muted">无认证信息</span>';
        }

        const authInfo = [];
        
        // key-auth 信息
        if (consumer.plugins['key-auth']) {
            const keyAuth = consumer.plugins['key-auth'];
            if (keyAuth.key) {
                const maskedKey = keyAuth.key.substring(0, 8) + '****' + keyAuth.key.substring(keyAuth.key.length - 4);
                authInfo.push(`<div><small><strong>API Key:</strong> <code>${maskedKey}</code></small></div>`);
            }
        }
        
        // basic-auth 信息
        if (consumer.plugins['basic-auth']) {
            const basicAuth = consumer.plugins['basic-auth'];
            if (basicAuth.username) {
                authInfo.push(`<div><small><strong>用户名:</strong> ${basicAuth.username}</small></div>`);
            }
            if (basicAuth.password) {
                const maskedPassword = basicAuth.password.substring(0, 4) + '****';
                authInfo.push(`<div><small><strong>密码:</strong> <code>${maskedPassword}</code></small></div>`);
            }
        }
        
        // jwt-auth 信息
        if (consumer.plugins['jwt-auth']) {
            const jwtAuth = consumer.plugins['jwt-auth'];
            if (jwtAuth.secret) {
                const maskedSecret = jwtAuth.secret.substring(0, 8) + '****';
                authInfo.push(`<div><small><strong>JWT密钥:</strong> <code>${maskedSecret}</code></small></div>`);
            }
        }
        
        // hmac-auth 信息
        if (consumer.plugins['hmac-auth']) {
            const hmacAuth = consumer.plugins['hmac-auth'];
            if (hmacAuth.access_key) {
                authInfo.push(`<div><small><strong>Access Key:</strong> ${hmacAuth.access_key}</small></div>`);
            }
            if (hmacAuth.secret_key) {
                const maskedSecret = hmacAuth.secret_key.substring(0, 8) + '****';
                authInfo.push(`<div><small><strong>Secret Key:</strong> <code>${maskedSecret}</code></small></div>`);
            }
        }
        
        if (authInfo.length === 0) {
            return '<span class="text-muted">无认证信息</span>';
        }
        
        return `<div class="text-truncate" style="max-width: 200px;" title="${authInfo.join(' ')}">${authInfo.join('')}</div>`;
    }

    // 更新消费者统计
    updateConsumersStats() {
        const totalConsumers = this.consumersData ? this.consumersData.length : 0;
        const activeConsumers = this.consumersData ? this.consumersData.filter(c => c.status === 'active').length : 0;
        const inactiveConsumers = this.consumersData ? this.consumersData.filter(c => c.status === 'inactive').length : 0;
        
        // 统计有认证插件的消费者数量
        const authPlugins = this.consumersData ? this.consumersData.filter(c => 
            c.plugins && typeof c.plugins === 'object' && Object.keys(c.plugins).length > 0
        ).length : 0;

        console.log('=== 消费者统计信息 ===');
        console.log('总消费者数:', totalConsumers);
        console.log('活跃系统数:', activeConsumers);
        console.log('暂停系统数:', inactiveConsumers);
        console.log('认证插件数:', authPlugins);
        console.log('消费者数据:', this.consumersData);
        
        const totalElement = document.getElementById('total-consumers');
        const enabledElement = document.getElementById('enabled-consumers');
        const disabledElement = document.getElementById('disabled-consumers');
        const authPluginsElement = document.getElementById('auth-plugins');

        if (totalElement) totalElement.textContent = totalConsumers;
        if (enabledElement) enabledElement.textContent = activeConsumers;
        if (disabledElement) disabledElement.textContent = inactiveConsumers;
        if (authPluginsElement) authPluginsElement.textContent = authPlugins;
    }

    // 绑定消费者管理事件
    bindConsumersEvents() {
        // 搜索功能
        const searchInput = document.getElementById('consumer-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterConsumers(e.target.value);
            });
        }
        
        // 排序功能
        this.bindConsumersSorting();
        
        // 加载路由选项
        this.loadRouteOptions();
    }

    // 绑定消费者排序功能
    bindConsumersSorting() {
        const sortableHeaders = document.querySelectorAll('#consumers-table .sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                this.sortConsumers(sortField);
            });
        });
    }

    // 排序消费者
    sortConsumers(sortField) {
        // 切换排序方向
        if (this.currentSortField === sortField) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = sortField;
            this.currentSortDirection = 'asc';
        }
        
        // 更新排序图标
        this.updateSortIcons('consumers-table', sortField, this.currentSortDirection);
        
        // 排序数据
        const sortedData = [...this.consumersData].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // 特殊处理某些字段
            if (sortField === 'createTime') {
                aValue = new Date(a.createTime);
                bValue = new Date(b.createTime);
            } else if (sortField === 'plugins') {
                // 插件数量排序
                aValue = a.plugins && typeof a.plugins === 'object' ? Object.keys(a.plugins).length : 0;
                bValue = b.plugins && typeof b.plugins === 'object' ? Object.keys(b.plugins).length : 0;
            } else if (sortField === 'desc') {
                // 描述字段排序
                aValue = a.desc || '';
                bValue = b.desc || '';
            } else if (sortField === 'authInfo') {
                // 认证信息排序（按插件数量）
                aValue = a.plugins && typeof a.plugins === 'object' ? Object.keys(a.plugins).length : 0;
                bValue = b.plugins && typeof b.plugins === 'object' ? Object.keys(b.plugins).length : 0;
            }
            
            // 字符串比较
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (this.currentSortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });
        
        // 重新显示排序后的数据
        this.currentPage = 1;
        this.displayConsumersWithPagination(sortedData);
    }

    // 搜索消费者
    filterConsumers(searchTerm) {
        if (!searchTerm) {
            this.currentPage = 1;
            this.displayConsumersWithPagination(this.consumersData);
            return;
        }
        
        const filtered = this.consumersData.filter(consumer => 
            consumer.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (consumer.desc && consumer.desc.toLowerCase().includes(searchTerm.toLowerCase())) ||
            consumer.authType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (consumer.email && consumer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
            // 搜索插件名称
            (consumer.plugins && Object.keys(consumer.plugins).some(plugin => 
                plugin.toLowerCase().includes(searchTerm.toLowerCase())
            )) ||
            // 搜索认证信息
            (consumer.plugins && Object.values(consumer.plugins).some(plugin => 
                JSON.stringify(plugin).toLowerCase().includes(searchTerm.toLowerCase())
            ))
        );
        
        this.currentPage = 1;
        this.displayConsumersWithPagination(filtered);
    }

    // 加载路由选项
    loadRouteOptions() {
        const routeSelect = document.getElementById('consumer-routes');
        if (!routeSelect || !this.routesData) return;
        
        // 保存当前选中的值
        const currentValues = Array.from(routeSelect.selectedOptions).map(option => option.value);
        
        // 清空现有选项（不包含默认提示选项）
        routeSelect.innerHTML = '';
        
        // 添加路由选项
        this.routesData.forEach(route => {
            const option = document.createElement('option');
            option.value = route.id;
            option.textContent = `${route.name || route.uri || `路由-${route.id}`} (${route.id})`;
            routeSelect.appendChild(option);
        });
        
        // 恢复选中的值
        currentValues.forEach(value => {
            const option = routeSelect.querySelector(`option[value="${value}"]`);
            if (option) {
                option.selected = true;
            }
        });
        
        console.log('路由选项加载完成，当前选中值:', currentValues);
    }



    // 创建消费者
    createConsumer() {
        document.getElementById('consumerModalLabel').innerHTML = '<i class="mdi mdi-plus-circle me-2"></i>新建消费者';
        document.getElementById('consumer-form').reset();
        
        // 基本信息
        document.getElementById('consumer-id').value = '';
        document.getElementById('consumer-id').disabled = true; // 新建时ID字段禁用，自动使用用户名
        document.getElementById('consumer-id').placeholder = '将自动使用用户名作为ID';
        
        // 确保用户名字段在新建时可编辑
        document.getElementById('consumer-username').readOnly = false;
        document.getElementById('consumer-username').disabled = false;
        document.getElementById('consumer-username').title = '';
        
        // 恢复用户名字段标签的原始状态
        const usernameLabel = document.querySelector('label[for="consumer-username"]');
        if (usernameLabel) {
            usernameLabel.innerHTML = '用户名 <span class="text-danger">*</span>';
        }
        
        // 重置编辑模式标识
        this.isEditMode = false;
        this.editingConsumerId = null;
        
        // 设置默认值
        document.getElementById('consumer-status').value = 'active';
        document.getElementById('consumer-create-time').value = new Date().toISOString().slice(0, 16);
        
        // 插件配置
        this.currentConsumerPlugins = [];
        this.updateConsumerPluginSelection([]);
        
        const modal = new bootstrap.Modal(document.getElementById('consumerModal'));
        modal.show();
    }

    // 编辑消费者
    editConsumer(consumerId) {
        console.log('编辑消费者，ID:', consumerId);
        const consumer = this.consumersData.find(c => c.id === consumerId);
        if (!consumer) {
            this.showNotification('消费者不存在', 'error');
            return;
        }
        
        console.log('消费者数据:', consumer);
        console.log('消费者路由:', consumer.routes);
        console.log('消费者插件:', consumer.plugins);
        
        document.getElementById('consumerModalLabel').innerHTML = '<i class="mdi mdi-pencil me-2"></i>编辑消费者';
        
        // 基本信息
        document.getElementById('consumer-id').value = consumer.id;
        document.getElementById('consumer-id').disabled = true;
        document.getElementById('consumer-username').value = consumer.username;
        document.getElementById('consumer-username').readOnly = true; // 编辑时不允许修改用户名
        document.getElementById('consumer-username').disabled = true; // 禁用用户名字段
        document.getElementById('consumer-username').title = '编辑模式下不允许修改用户名（APISIX要求ID与用户名一致）';
        
        // 更新用户名字段标签，说明为什么不能修改
        const usernameLabel = document.querySelector('label[for="consumer-username"]');
        if (usernameLabel) {
            usernameLabel.innerHTML = '用户名 <span class="text-danger">*</span> <small class="text-muted">(编辑时不可修改)</small>';
        }
        
        document.getElementById('consumer-desc').value = consumer.description || consumer.desc || '';
        
        // 设置编辑模式标识
        this.isEditMode = true;
        this.editingConsumerId = consumer.id;
        
        // 认证配置已移至插件配置中
        

        
        // 处理状态字段
        console.log('编辑消费者状态字段:', consumer.status, typeof consumer.status);
        const statusValue = consumer.status || 'active';
        document.getElementById('consumer-status').value = statusValue;
        console.log('设置状态字段值:', statusValue);
        
        // 设置创建时间
        if (consumer.createTime) {
            document.getElementById('consumer-create-time').value = consumer.createTime;
        } else if (consumer.create_time) {
            document.getElementById('consumer-create-time').value = consumer.create_time;
        }
        
        // 插件配置
        if (consumer.plugins && typeof consumer.plugins === 'object' && Object.keys(consumer.plugins).length > 0) {
            // 将plugins对象转换为插件配置数组
            this.currentConsumerPlugins = Object.keys(consumer.plugins).map(pluginName => {
                const pluginConfig = consumer.plugins[pluginName];
                return {
                    id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    plugin_name: pluginName,
                    name: `${pluginName}配置`,
                    config: pluginConfig,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });
            this.updateConsumerPluginSelection(this.currentConsumerPlugins);
        } else {
            this.currentConsumerPlugins = [];
            this.updateConsumerPluginSelection([]);
        }
        
        const modal = new bootstrap.Modal(document.getElementById('consumerModal'));
        modal.show();
    }

    // 查看消费者
    viewConsumer(consumerId) {
        const consumer = this.consumersData.find(c => c.id === consumerId);
        if (!consumer) {
            this.showNotification('消费者不存在', 'error');
            return;
        }
        
        // 显示消费者详情模态框
        this.showConsumerDetailsModal(consumer);
    }

    // 显示消费者详情模态框
    showConsumerDetailsModal(consumer) {
        const modalHTML = `
            <div class="modal fade" id="consumerDetailsModal" tabindex="-1" aria-labelledby="consumerDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="consumerDetailsModalLabel">
                                <i class="mdi mdi-eye me-2"></i>消费者配置预览
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body p-0">
                            <pre class="bg-dark text-light p-4 m-0" style="font-size: 0.9rem; max-height: 70vh; overflow-y: auto; border-radius: 0;"><code>${JSON.stringify(consumer, null, 2)}</code></pre>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById('consumerDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新的模态框到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('consumerDetailsModal'), {
            backdrop: true,
            keyboard: true
        });
        modal.show();
        
        // 模态框关闭后清理DOM
        document.getElementById('consumerDetailsModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
        
        // 绑定关闭按钮事件
        const closeBtn = document.getElementById('consumerDetailsModal').querySelector('.btn-secondary');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeConsumerDetailsModal();
            });
        }
    }
    
    // 关闭消费者详情模态框
    closeConsumerDetailsModal() {
        const modalElement = document.getElementById('consumerDetailsModal');
        if (modalElement) {
            try {
                // 尝试使用Bootstrap 5的方法
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                } else {
                    // 如果获取实例失败，直接操作DOM
                    modalElement.classList.remove('show');
                    modalElement.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.remove();
                    }
                }
            } catch (error) {
                console.warn('关闭模态框失败，使用DOM操作:', error);
                // 直接操作DOM关闭模态框
                modalElement.classList.remove('show');
                modalElement.style.display = 'none';
                document.body.classList.remove('modal-open');
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
            }
        }
    }

    // 切换消费者状态
    toggleConsumerStatus(consumerId) {
        const consumer = this.consumersData.find(c => c.id === consumerId);
        if (!consumer) {
            this.showNotification('消费者不存在', 'error');
            return;
        }
        
        const newStatus = consumer.status === 'active' ? 'inactive' : 'active';
        const action = newStatus === 'active' ? '启用' : '禁用';
        
        this.showConfirm(`确定要${action}消费者 "${consumer.username}" 吗？`, () => {
            consumer.status = newStatus;
            this.currentPage = 1;
            this.displayConsumersWithPagination(this.consumersData);
            this.updateConsumersStats();
            this.showNotification(`消费者已${action}`, 'success');
        });
    }

    // 删除消费者
    async deleteConsumer(consumerId) {
        console.log('=== 开始删除消费者 ===');
        console.log('要删除的消费者ID:', consumerId);
        
        const consumer = this.consumersData.find(c => c.id === consumerId);
        if (!consumer) {
            console.error('消费者不存在:', consumerId);
            this.showNotification('消费者不存在', 'error');
            return;
        }
        
        console.log('找到要删除的消费者:', consumer);
        
        this.showConfirm(`确定要删除消费者 "${consumer.username}" 吗？此操作不可恢复！`, async () => {
            try {
                console.log('用户确认删除，开始调用APISIX API...');
                
                // 调用APISIX API删除消费者
                const response = await this.apisixRequest(`/consumers/${consumerId}`, {
                    method: 'DELETE'
                });
                
                console.log('APISIX删除响应:', response);
                this.showNotification('正在刷新数据...', 'info');
                
                // 重新获取消费者数据
                console.log('开始重新获取消费者数据...');
                const freshConsumers = await this.getConsumers();
                console.log('重新获取的原始数据:', freshConsumers);
                
                if (freshConsumers && Array.isArray(freshConsumers)) {
                    console.log('数据是数组，开始标准化处理...');
                    // 数据标准化处理 - 注意：validateAndNormalizeData返回的是数组
                    const normalizedConsumers = this.validateAndNormalizeData(freshConsumers, 'consumers');
                    console.log('标准化后的数据:', normalizedConsumers);
                    
                    this.consumersData = normalizedConsumers;
                    console.log('更新后的consumersData:', this.consumersData);
                    
                    // 保存到本地存储
                    this.saveToStorage('consumers', this.consumersData);
                    
                    // 重新显示列表
                    this.currentPage = 1;
                    this.displayConsumersWithPagination(this.consumersData);
                    this.updateConsumersStats();
                    
                    // 如果当前在概览页面，更新访问链路关系
                    if (this.currentPage === 'overview') {
                        this.updateOverviewAccessChains();
                    }
                    
                    this.showNotification('消费者已删除，数据已刷新', 'success');
                } else {
                    console.log('重新获取数据失败或格式不正确，使用本地删除');
                    // 如果重新读取失败，使用本地删除
                    this.consumersData = this.consumersData.filter(c => c.id !== consumerId);
                    this.saveToStorage('consumers', this.consumersData);
                    this.currentPage = 1;
                    this.displayConsumersWithPagination(this.consumersData);
                    this.updateConsumersStats();
                    
                    // 如果当前在概览页面，更新访问链路关系
                    if (this.currentPage === 'overview') {
                        this.updateOverviewAccessChains();
                    }
                    
                    this.showNotification('消费者已删除，但数据刷新失败', 'warning');
                }
            } catch (error) {
                console.error('删除消费者失败:', error);
                console.error('错误详情:', {
                    method: 'DELETE',
                    url: `/consumers/${consumerId}`,
                    error: error.message
                });
                this.showNotification(`删除失败: ${error.message}`, 'error');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }

    // 保存消费者
    async saveConsumer() {
        console.log('=== 开始保存消费者 ===');
        
        const form = document.getElementById('consumer-form');
        if (!form.checkValidity()) {
            console.log('表单验证失败');
            form.reportValidity();
            return;
        }
        
        console.log('表单验证通过');
        
        // 处理插件配置
        let processedPlugins = {};
        if (this.currentConsumerPlugins && this.currentConsumerPlugins.length > 0) {
            this.currentConsumerPlugins.forEach(plugin => {
                processedPlugins[plugin.plugin_name] = plugin.config || {};
            });
        }
        
        const consumerData = {
            id: document.getElementById('consumer-id').value || '',
            username: document.getElementById('consumer-username').value,
            description: document.getElementById('consumer-desc').value,
            status: document.getElementById('consumer-status').value,
            createTime: document.getElementById('consumer-create-time').value || new Date().toLocaleString('zh-CN'),
            plugins: processedPlugins
        };
        
        // 验证用户名格式
        if (!consumerData.username || consumerData.username.trim() === '') {
            this.showNotification('用户名不能为空', 'error');
            return;
        }
        
        // APISIX用户名要求：只能包含字母、数字、下划线、连字符
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(consumerData.username)) {
            this.showNotification('用户名只能包含字母、数字、下划线(_)、连字符(-)', 'error');
            return;
        }
        
        // 在编辑模式下，使用原有的ID；在新建模式下，ID等于用户名
        if (this.isEditMode && this.editingConsumerId) {
            consumerData.id = this.editingConsumerId;
        } else {
            consumerData.id = consumerData.username;
        }
        
        // 如果是编辑模式，保留原有的创建时间
        const existingConsumer = this.consumersData.find(c => c.id === consumerData.id);
        if (existingConsumer && existingConsumer.createTime) {
            consumerData.createTime = existingConsumer.createTime;
        }
        
        try {
            // 准备APISIX API数据格式
            // APISIX要求：请求体中的username必须与URL路径中的ID完全一致
            const apisixData = {
                username: consumerData.id, // 使用ID作为username，确保与URL路径一致
                desc: consumerData.description || '', // 描述字段独立，不绑定用户名
                plugins: consumerData.plugins
            };
            
            // 确保插件配置格式正确
            if (apisixData.plugins && Object.keys(apisixData.plugins).length > 0) {
                // 处理key-auth插件格式
                if (apisixData.plugins['key-auth']) {
                    apisixData.plugins['key-auth'] = {
                        header: 'apikey',
                        query: 'apikey',
                        hide_credentials: false,
                        key: apisixData.plugins['key-auth'].key || this.generateRandomString(32)
                    };
                }
                
                // 处理basic-auth插件格式
                if (apisixData.plugins['basic-auth']) {
                    apisixData.plugins['basic-auth'] = {
                        username: apisixData.plugins['basic-auth'].username || consumerData.id, // 使用ID确保一致性
                        password: apisixData.plugins['basic-auth'].password || this.generateRandomString(16)
                    };
                }
            }
            
            console.log('准备保存的消费者数据:', apisixData);
            console.log('消费者ID:', consumerData.id);
            console.log('APISIX请求URL:', `/consumers/${consumerData.id}`);
            console.log('APISIX请求体username:', apisixData.username);
            console.log('URL路径ID:', consumerData.id);
            console.log('username与ID是否一致:', apisixData.username === consumerData.id);
            
            // 检查是否是编辑模式
            const existingIndex = this.consumersData.findIndex(c => c.id === consumerData.id);
            
            // APISIX消费者API统一使用PUT方法（创建和更新）
            const response = await this.apisixRequest(`/consumers/${consumerData.id}`, {
                method: 'PUT',
                body: JSON.stringify(apisixData)
            });
            
            console.log('APISIX保存响应:', response);
            
            if (existingIndex >= 0) {
                this.showNotification('消费者已更新到APISIX', 'success');
            } else {
                this.showNotification('消费者已创建到APISIX', 'success');
            }
            
            // 保存成功后，立即从APISIX重新读取最新数据
            this.showNotification('正在刷新数据...', 'info');
            
            // 重新获取消费者数据
            console.log('开始重新获取消费者数据...');
            const freshConsumers = await this.getConsumers();
            console.log('重新获取的原始数据:', freshConsumers);
            
            if (freshConsumers && Array.isArray(freshConsumers)) {
                console.log('数据是数组，开始标准化处理...');
                // 数据标准化处理 - 注意：validateAndNormalizeData返回的是数组
                const normalizedConsumers = this.validateAndNormalizeData(freshConsumers, 'consumers');
                console.log('标准化后的数据:', normalizedConsumers);
                
                this.consumersData = normalizedConsumers;
                console.log('更新后的consumersData:', this.consumersData);
                
                // 保存到本地存储
                this.saveToStorage('consumers', this.consumersData);
                
                // 重新显示列表
                this.currentPage = 1;
                this.displayConsumersWithPagination(this.consumersData);
                this.updateConsumersStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('数据已刷新，显示最新配置', 'success');
            } else {
                console.log('重新获取数据失败或格式不正确，使用本地数据');
                // 如果重新读取失败，使用本地数据
                if (existingIndex >= 0) {
                    this.consumersData[existingIndex] = { ...existingConsumer, ...consumerData };
                } else {
                    this.consumersData.push(consumerData);
                }
                
                this.saveToStorage('consumers', this.consumersData);
                this.currentPage = 1;
                this.displayConsumersWithPagination(this.consumersData);
                this.updateConsumersStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('保存成功，但数据刷新失败', 'warning');
            }
            
            // 重置编辑模式标识
            this.isEditMode = false;
            this.editingConsumerId = null;
            
            // 关闭模态框
            const modalElement = document.getElementById('consumerModal');
            if (modalElement) {
                try {
                    // 尝试使用Bootstrap 5的方法
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                    } else {
                        // 如果获取实例失败，直接操作DOM
                        modalElement.classList.remove('show');
                        modalElement.style.display = 'none';
                        document.body.classList.remove('modal-open');
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                    }
                } catch (error) {
                    console.warn('关闭模态框失败，使用DOM操作:', error);
                    // 直接操作DOM关闭模态框
                    modalElement.classList.remove('show');
                    modalElement.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.remove();
                    }
                }
            }
            
        } catch (error) {
            console.error('保存消费者到APISIX失败:', error);
            console.error('错误详情:', {
                method: 'PUT',
                url: `${this.apisixConfig.baseUrl}/consumers/${consumerData.id}`,
                data: consumerData,
                error: error.message
            });
            
            // 如果是400错误，提供更详细的错误信息
            if (error.message.includes('400')) {
                this.showNotification('请求数据格式错误，请检查输入信息', 'error');
            } else if (error.message.includes('405')) {
                this.showNotification('API方法不被允许，请检查APISIX版本和配置', 'error');
            } else {
                this.showNotification(`保存失败: ${error.message}`, 'error');
            }
        }
    }

    // 取消消费者操作
    cancelConsumer() {
        const modalElement = document.getElementById('consumerModal');
        if (modalElement) {
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
        }
        this.showNotification('操作已取消', 'info');
    }

    // 刷新消费者
    refreshConsumers() {
        this.showNotification('正在刷新消费者数据...', 'info');
        setTimeout(async () => {
            this.currentPage = 1;
            // 强制重新获取数据
            await this.refreshAPISIXData();
            this.displayConsumersWithPagination(this.consumersData);
            this.updateConsumersStats();
            this.showNotification('消费者数据已刷新', 'success');
        }, 1000);
    }

    // ==================== 上游管理功能 ====================

    // 初始化上游管理
    initUpstreamsManagement() {
        this.initUpstreamsData();
        this.bindUpstreamsEvents();
        this.updateUpstreamsStats();
    }

    // 初始化上游数据
    initUpstreamsData() {
        // 如果还没有数据，则初始化为空数组
        if (!this.upstreamsData || this.upstreamsData.length === 0) {
            this.upstreamsData = [];
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displayUpstreamsWithPagination(this.upstreamsData);
        this.updateUpstreamsStats();
    }

    // 显示上游列表（带分页）
    displayUpstreamsWithPagination(upstreams) {
        const tbody = document.getElementById('upstreams-tbody');
        if (!tbody) return;
        
        if (upstreams.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        <i class="mdi mdi-server mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无上游数据</p>
                    </td>
                </tr>
            `;
            this.updateUpstreamsPagination(0);
            return;
        }
        
        // 计算分页
        const totalPages = Math.ceil(upstreams.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, upstreams.length);
        const currentPageUpstreams = upstreams.slice(startIndex, endIndex);
        

        
        // 渲染当前页数据
        tbody.innerHTML = currentPageUpstreams.map(upstream => `
            <tr>
                <td><code>${upstream.id}</code></td>
                <td>
                    <div>
                        <strong>${upstream.name}</strong>
                        ${upstream.description ? `<br><small class="text-muted">${upstream.description}</small>` : ''}
                    </div>
                </td>
                <td>
                    <span class="badge bg-secondary">${upstream.loadBalancer || 'roundrobin'}</span>
                </td>
                <td>
                    ${upstream.nodes && upstream.nodes.length > 0 ? 
                            upstream.nodes.map(node => {
                                const isDomain = /^[a-zA-Z]/.test(node.host);
                                const badgeClass = isDomain ? 'bg-info text-white' : 'bg-light text-dark';
                                return `<span class="badge ${badgeClass} me-1" title="${isDomain ? '域名节点' : 'IP节点'}">${node.host}:${node.port}</span>`;
                            }).join('') :
                        '<span class="text-muted">无节点</span>'
                    }
                </td>
                <td>
                    <span class="badge ${upstream.healthCheck ? 'bg-success' : 'bg-secondary'}">
                        ${upstream.healthCheck ? '已启用' : '未启用'}
                    </span>
                </td>
                <td>
                    ${(upstream.services && Array.isArray(upstream.services) && upstream.services.length > 0) 
                        ? upstream.services.map(service => `<span class="badge bg-light text-dark me-1">${service}</span>`).join('') 
                        : '<span class="text-muted">无</span>'
                    }
                </td>
                <td>
                    <span class="badge ${upstream.status === 'enabled' ? 'bg-success' : 'bg-warning'}">
                        ${upstream.status === 'enabled' ? '已启用' : '已禁用'}
                    </span>
                </td>
                <td>${upstream.createTime}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.editUpstream('${upstream.id}')" title="编辑">
                            <i class="mdi mdi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.viewUpstream('${upstream.id}')" title="查看">
                            <i class="mdi mdi-eye"></i>
                        </button>
                        <button class="btn btn-outline-${upstream.status === 'enabled' ? 'warning' : 'success'}" 
                                onclick="window.apisixAdmin.toggleUpstreamStatus('${upstream.id}')" 
                                title="${upstream.status === 'enabled' ? '禁用' : '启用'}">
                            <i class="mdi mdi-${upstream.status === 'enabled' ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="window.apisixAdmin.deleteUpstream('${upstream.id}')" title="删除">
                            <i class="mdi mdi-delete"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // 更新分页信息
        this.updateUpstreamsPagination(upstreams.length, totalPages, startIndex + 1, endIndex);
    }

    // 更新上游分页信息
    updateUpstreamsPagination(totalItems, totalPages, startItem, endItem) {
        // 更新分页信息显示
        document.getElementById('upstreams-start').textContent = startItem || 0;
        document.getElementById('upstreams-end').textContent = endItem || 0;
        document.getElementById('upstreams-total').textContent = totalItems || 0;
        
        // 生成分页按钮
        const paginationContainer = document.getElementById('upstreams-pagination');
        if (!paginationContainer) return;
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }
        
        let paginationHTML = '';
        
        // 上一页按钮
        paginationHTML += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToUpstreamPage(${this.currentPage - 1})">
                    <i class="mdi mdi-chevron-left"></i>
                </a>
            </li>
        `;
        
        // 页码按钮
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // 第一页
        if (startPage > 1) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToUpstreamPage(1)">1</a>
                </li>
            `;
            if (startPage > 2) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        
        // 中间页码
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToUpstreamPage(${i})">${i}</a>
                </li>
            `;
        }
        
        // 最后一页
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToUpstreamPage(${totalPages})">${totalPages}</a>
                </li>
            `;
        }
        
        // 下一页按钮
        paginationHTML += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToUpstreamPage(${this.currentPage + 1})">
                    <i class="mdi mdi-chevron-right"></i>
                </a>
            </li>
        `;
        
        paginationContainer.innerHTML = paginationHTML;
    }

    // 跳转到指定上游页面
    goToUpstreamPage(page) {
        if (page < 1 || page > Math.ceil(this.upstreamsData.length / this.pageSize)) return;
        this.currentPage = page;
        this.displayUpstreamsWithPagination(this.upstreamsData);
    }

    // 更新上游统计
    updateUpstreamsStats() {
        const totalUpstreams = this.upstreamsData.length;
        const enabledUpstreams = this.upstreamsData.filter(u => u.status === 'enabled').length;
        const disabledUpstreams = this.upstreamsData.filter(u => u.status === 'disabled').length;
        const totalNodes = this.upstreamsData.reduce((sum, u) => sum + u.nodes.length, 0);
        
        console.log('更新上游统计数据:', { totalUpstreams, enabledUpstreams, disabledUpstreams, totalNodes });
        
        const totalElement = document.getElementById('total-upstreams');
        const enabledElement = document.getElementById('enabled-upstreams');
        const disabledElement = document.getElementById('disabled-upstreams');
        const nodesElement = document.getElementById('total-nodes');
        
        if (totalElement) totalElement.textContent = totalUpstreams;
        if (enabledElement) enabledElement.textContent = enabledUpstreams;
        if (disabledElement) disabledElement.textContent = disabledUpstreams;
        if (nodesElement) nodesElement.textContent = totalNodes;
    }

    // 绑定上游管理事件
    bindUpstreamsEvents() {
        // 搜索功能
        const searchInput = document.getElementById('upstream-search');
        console.log('上游搜索输入框元素:', searchInput);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                console.log('上游搜索输入事件触发:', e.target.value);
                this.filterUpstreams(e.target.value);
            });
            console.log('上游搜索事件绑定成功');
        } else {
            console.log('上游搜索输入框未找到');
        }
        
        // 排序功能
        this.bindUpstreamsSorting();
    }

    // 绑定上游排序功能
    bindUpstreamsSorting() {
        console.log('绑定上游排序功能开始');
        const sortableHeaders = document.querySelectorAll('#upstreams-table .sortable');
        console.log('找到可排序列:', sortableHeaders.length);
        
        sortableHeaders.forEach((header, index) => {
            const sortField = header.getAttribute('data-sort');
            console.log(`绑定列 ${index + 1}: ${sortField}`);
            
            header.addEventListener('click', () => {
                console.log('点击排序列:', sortField);
                this.sortUpstreams(sortField);
            });
        });
        console.log('上游排序功能绑定完成');
    }
    
    // 排序上游
    sortUpstreams(sortField) {
        console.log('开始排序上游，字段:', sortField);
        console.log('当前排序方向:', this.currentSortDirection);
        
        // 切换排序方向
        if (this.currentSortField === sortField) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = sortField;
            this.currentSortDirection = 'asc';
        }
        
        console.log('新的排序方向:', this.currentSortDirection);
        
        // 更新排序图标
        this.updateSortIcons('upstreams-table', sortField, this.currentSortDirection);
        
        // 排序数据
        const sortedData = [...this.upstreamsData].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // 特殊处理某些字段
            if (sortField === 'nodes') {
                aValue = a.nodes ? a.nodes.length : 0;
                bValue = b.nodes ? b.nodes.length : 0;
            } else if (sortField === 'createTime') {
                aValue = new Date(a.createTime);
                bValue = new Date(b.createTime);
            }
            
            // 字符串比较
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (this.currentSortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });
        
        console.log('排序完成，数据数量:', sortedData.length);
        console.log('排序后前3条数据:', sortedData.slice(0, 3));
        
        // 重新显示排序后的数据
        this.currentPage = 1;
        this.displayUpstreamsWithPagination(sortedData);
    }
    
    // 搜索上游
    filterUpstreams(searchTerm) {
        console.log('上游搜索关键词:', searchTerm);
        console.log('当前上游数据数量:', this.upstreamsData.length);
        
        if (!searchTerm) {
            this.currentPage = 1;
            this.displayUpstreamsWithPagination(this.upstreamsData);
            console.log('上游搜索为空，显示所有上游');
            return;
        }
        
        const filtered = this.upstreamsData.filter(upstream => 
            upstream.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            upstream.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            upstream.nodes.some(node => node.host.includes(searchTerm))
        );
        
        console.log('上游搜索结果数量:', filtered.length);
        console.log('上游搜索结果:', filtered.map(u => u.name));
        
        this.currentPage = 1;
        this.displayUpstreamsWithPagination(filtered);
    }



    // 刷新上游
    refreshUpstreams() {
        this.showNotification('正在刷新上游数据...', 'info');
        setTimeout(() => {
            this.currentPage = 1;
            this.initUpstreamsData();
            this.updateUpstreamsStats();
            this.showNotification('上游数据已刷新', 'success');
        }, 1000);
    }

    // 创建上游
    createUpstream() {
        document.getElementById('upstreamModalLabel').innerHTML = '<i class="mdi mdi-plus-circle me-2"></i>新建上游';
        document.getElementById('upstream-form').reset();
        
        // 在新建模式下，ID字段禁用，自动生成
        document.getElementById('upstream-id').value = '';
        document.getElementById('upstream-id').disabled = true;
        document.getElementById('upstream-id').placeholder = '系统自动生成';
        
        // 设置默认值
        document.getElementById('upstream-enabled').checked = true;
        document.getElementById('health-check-enabled').checked = false;
        
        // 清空节点容器并添加一个默认节点
        document.getElementById('nodes-container').innerHTML = '';
        this.addNode();
        
        const modal = new bootstrap.Modal(document.getElementById('upstreamModal'));
        modal.show();
    }

    // 取消上游操作
    cancelUpstream() {
        const modalElement = document.getElementById('upstreamModal');
        if (modalElement) {
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
        }
        this.showNotification('操作已取消', 'info');
    }

    // 验证主机地址格式（支持IP和域名）
    validateHost(host) {
        // IP地址正则表达式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        
        // 域名正则表达式
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        
        // 本地主机名
        const localhostRegex = /^localhost$/;
        
        return ipRegex.test(host) || domainRegex.test(host) || localhostRegex.test(host);
    }

    // 保存上游
    async saveUpstream() {
        console.log('=== 开始保存上游 ===');
        
        const form = document.getElementById('upstream-form');
        if (!form.checkValidity()) {
            console.log('表单验证失败');
            form.reportValidity();
            return;
        }
        
        console.log('表单验证通过');
        
        // 从节点容器中获取节点数据
        const nodesContainer = document.getElementById('nodes-container');
        const nodes = [];
        if (nodesContainer) {
            const nodeRows = nodesContainer.querySelectorAll('.row');
            nodeRows.forEach(row => {
                const hostInput = row.querySelector('input[placeholder*="主机地址"]');
                const portInput = row.querySelector('input[placeholder*="端口"]');
                const weightInput = row.querySelector('input[placeholder*="权重"]');
                
                if (hostInput && portInput && hostInput.value && portInput.value) {
                    // 验证主机地址格式
                    if (!this.validateHost(hostInput.value)) {
                        this.showNotification(`无效的主机地址格式: ${hostInput.value}`, 'error');
                        hostInput.focus();
                        return;
                    }
                    
                    nodes.push({
                        host: hostInput.value,
                        port: parseInt(portInput.value) || 80,
                        weight: weightInput ? (parseInt(weightInput.value) || 1) : 1
                    });
                }
            });
        }
        
        const upstreamData = {
            id: document.getElementById('upstream-id').value || `upstream_${Math.random().toString(36).substr(2, 9)}`,
            name: document.getElementById('upstream-name').value,
            loadBalancer: document.getElementById('upstream-type').value,
            timeout: parseInt(document.getElementById('upstream-timeout').value) || 3,
            description: document.getElementById('upstream-desc').value,
            status: document.getElementById('upstream-enabled').checked ? 'enabled' : 'disabled',
            healthCheck: document.getElementById('health-check-enabled').checked,
            nodes: nodes,
            createTime: new Date().toLocaleString('zh-CN')
        };
        
        // 验证上游名称
        if (!upstreamData.name || upstreamData.name.trim() === '') {
            this.showNotification('上游名称不能为空', 'error');
            return;
        }
        
        // 验证节点配置
        if (!upstreamData.nodes || upstreamData.nodes.length === 0) {
            this.showNotification('至少需要配置一个节点', 'error');
            return;
        }
        
        try {
            // 自动判断scheme
            const determineScheme = (nodes) => {
                if (!nodes || nodes.length === 0) return 'http';
                // 如果任何节点使用443端口，使用https
                if (nodes.some(node => node.port === 443)) return 'https';
                // 如果任何节点使用80端口，使用http
                if (nodes.some(node => node.port === 80)) return 'http';
                // 默认使用http
                return 'http';
            };

            // 准备APISIX API数据格式
            const apisixData = {
                key: upstreamData.id, // APISIX要求提供key字段
                name: upstreamData.name, // 保留用户自定义的名称
                type: upstreamData.loadBalancer,
                scheme: determineScheme(upstreamData.nodes), // 自动判断协议
                timeout: {
                    connect: upstreamData.timeout,
                    send: upstreamData.timeout,
                    read: upstreamData.timeout
                },
                desc: upstreamData.description || '',
                nodes: upstreamData.nodes.map(node => ({
                    host: node.host,
                    port: node.port,
                    weight: node.weight
                }))
            };
            
            console.log('准备保存的上游数据:', apisixData);
            console.log('上游ID:', upstreamData.id);
            console.log('APISIX请求URL:', `/upstreams/${upstreamData.id}`);
        
        // 检查是否是编辑模式
        const existingIndex = this.upstreamsData.findIndex(u => u.id === upstreamData.id);
            
            // APISIX上游API：统一使用PUT方法，ID在请求体中
            const response = await this.apisixRequest(`/upstreams/${upstreamData.id}`, {
                method: 'PUT',
                body: JSON.stringify(apisixData)
            });
            
            console.log('APISIX保存响应:', response);
            
        if (existingIndex >= 0) {
                this.showNotification('上游已更新到APISIX', 'success');
        } else {
                this.showNotification('上游已创建到APISIX', 'success');
            }
            
            // 保存成功后，立即从APISIX重新读取最新数据
            this.showNotification('正在刷新数据...', 'info');
            
            // 重新获取上游数据
            console.log('开始重新获取上游数据...');
            const freshUpstreams = await this.getUpstreams();
            console.log('重新获取的原始数据:', freshUpstreams);
            
            if (freshUpstreams && Array.isArray(freshUpstreams)) {
                console.log('数据是数组，开始标准化处理...');
                // 数据标准化处理
                const normalizedUpstreams = this.validateAndNormalizeData(freshUpstreams, 'upstreams');
                console.log('标准化后的数据:', normalizedUpstreams);
                
                this.upstreamsData = normalizedUpstreams;
                console.log('更新后的upstreamsData:', this.upstreamsData);
        
        // 保存到本地存储
        this.saveToStorage('upstreams', this.upstreamsData);
        
                // 重新显示列表
        this.currentPage = 1;
        this.displayUpstreamsWithPagination(this.upstreamsData);
        this.updateUpstreamsStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('数据已刷新，显示最新配置', 'success');
            } else {
                console.log('重新获取数据失败或格式不正确，使用本地数据');
                // 如果重新读取失败，使用本地数据
                if (existingIndex >= 0) {
                    this.upstreamsData[existingIndex] = upstreamData;
                } else {
                    this.upstreamsData.push(upstreamData);
                }
                
                this.saveToStorage('upstreams', this.upstreamsData);
                this.currentPage = 1;
                this.displayUpstreamsWithPagination(this.upstreamsData);
                this.updateUpstreamsStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('保存成功，但数据刷新失败', 'warning');
            }
        
        // 关闭模态框
        const modalElement = document.getElementById('upstreamModal');
        if (modalElement) {
                try {
                    // 尝试使用Bootstrap 5的方法
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                    } else {
                        // 如果获取实例失败，直接操作DOM
                        modalElement.classList.remove('show');
                        modalElement.style.display = 'none';
                        document.body.classList.remove('modal-open');
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                    }
                } catch (error) {
                    console.warn('关闭模态框失败，使用DOM操作:', error);
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
                }
            }
            
        } catch (error) {
            console.error('保存上游到APISIX失败:', error);
            this.showNotification('保存上游失败: ' + error.message, 'error');
        }
    }

    // 编辑上游
    editUpstream(upstreamId) {
        const upstream = this.upstreamsData.find(u => u.id === upstreamId);
        if (!upstream) {
            this.showNotification('上游不存在', 'error');
            return;
        }
        
        document.getElementById('upstreamModalLabel').innerHTML = '<i class="mdi mdi-pencil me-2"></i>编辑上游';
        document.getElementById('upstream-id').value = upstream.id;
        document.getElementById('upstream-id').disabled = true;
        document.getElementById('upstream-name').value = upstream.name;
        document.getElementById('upstream-type').value = upstream.loadBalancer;
        document.getElementById('upstream-timeout').value = upstream.timeout;
        document.getElementById('upstream-desc').value = upstream.description || '';
        document.getElementById('upstream-enabled').checked = upstream.status === 'enabled';
        document.getElementById('health-check-enabled').checked = upstream.healthCheck;
        
        // 加载节点数据
        this.loadUpstreamNodes(upstream.nodes);
        
        const modal = new bootstrap.Modal(document.getElementById('upstreamModal'));
        modal.show();
    }

    // 查看上游
    viewUpstream(upstreamId) {
        const upstream = this.upstreamsData.find(u => u.id === upstreamId);
        if (!upstream) {
            this.showNotification('上游不存在', 'error');
            return;
        }
        
        // 显示上游详情模态框
        this.showUpstreamDetailsModal(upstream);
    }

    // 显示上游详情模态框
    showUpstreamDetailsModal(upstream) {
        const modalHTML = `
            <div class="modal fade" id="upstreamDetailsModal" tabindex="-1" aria-labelledby="upstreamDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="upstreamDetailsModalLabel">
                                <i class="mdi mdi-eye me-2"></i>上游配置预览
                            </h5>
                        </div>
                        <div class="modal-body p-0">
                            <pre class="bg-dark text-light p-4 m-0" style="font-size: 0.9rem; max-height: 70vh; overflow-y: auto; border-radius: 0;"><code>${JSON.stringify(upstream, null, 2)}</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById('upstreamDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新的模态框到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('upstreamDetailsModal'), {
            backdrop: true,
            keyboard: true
        });
        modal.show();
        
        // 模态框关闭后清理DOM
        document.getElementById('upstreamDetailsModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 切换上游状态
    toggleUpstreamStatus(upstreamId) {
        const upstream = this.upstreamsData.find(u => u.id === upstreamId);
        if (!upstream) {
            this.showNotification('上游不存在', 'error');
            return;
        }
        
        const newStatus = upstream.status === 'enabled' ? 'disabled' : 'enabled';
        const action = newStatus === 'enabled' ? '启用' : '禁用';
        
        this.showConfirm(`确定要${action}上游 "${upstream.name}" 吗？`, () => {
            upstream.status = newStatus;
            this.displayUpstreamsWithPagination(this.upstreamsData);
            this.updateUpstreamsStats();
            this.showNotification(`上游已${action}`, 'success');
        });
    }

    // 删除上游
    async deleteUpstream(upstreamId) {
        console.log('=== 开始删除上游 ===');
        console.log('要删除的上游ID:', upstreamId);
        
        const upstream = this.upstreamsData.find(u => u.id === upstreamId);
        if (!upstream) {
            console.error('上游不存在:', upstreamId);
            this.showNotification('上游不存在', 'error');
            return;
        }
        
        console.log('找到要删除的上游:', upstream);
        
        // 删除前检查上游是否被使用
        const servicesUsingUpstream = this.servicesData.filter(service => service.upstream === upstreamId);
        if (servicesUsingUpstream.length > 0) {
            const serviceNames = servicesUsingUpstream.map(s => s.name || s.id).join(', ');
            this.showNotification(`无法删除上游：该上游正在被以下服务使用：${serviceNames}。请先删除或修改这些服务。`, 'warning');
            return;
        }
        
        this.showConfirm(`确定要删除上游 "${upstream.name}" 吗？此操作不可恢复！`, async () => {
            try {
                console.log('用户确认删除，开始调用APISIX API...');
                
                // 调用APISIX API删除上游
                const response = await this.apisixRequest(`/upstreams/${upstreamId}`, {
                    method: 'DELETE'
                });
                
                console.log('APISIX删除响应:', response);
                this.showNotification('正在刷新数据...', 'info');
                
                // 重新获取上游数据
                console.log('开始重新获取上游数据...');
                const freshUpstreams = await this.getUpstreams();
                console.log('重新获取的原始数据:', freshUpstreams);
                
                if (freshUpstreams && Array.isArray(freshUpstreams)) {
                    console.log('数据是数组，开始标准化处理...');
                    // 数据标准化处理
                    const normalizedUpstreams = this.validateAndNormalizeData(freshUpstreams, 'upstreams');
                    console.log('标准化后的数据:', normalizedUpstreams);
                    
                    this.upstreamsData = normalizedUpstreams;
                    console.log('更新后的upstreamsData:', this.upstreamsData);
        
        // 保存到本地存储
        this.saveToStorage('upstreams', this.upstreamsData);
        
                    // 重新显示列表
            this.currentPage = 1;
            this.displayUpstreamsWithPagination(this.upstreamsData);
            this.updateUpstreamsStats();
                    
                    // 如果当前在概览页面，更新访问链路关系
                    if (this.currentPage === 'overview') {
                        this.updateOverviewAccessChains();
                    }
                    
                    this.showNotification('上游已删除，数据已刷新', 'success');
                } else {
                    console.log('重新获取数据失败或格式不正确，使用本地删除');
                    // 如果重新读取失败，使用本地删除
                    this.upstreamsData = this.upstreamsData.filter(u => u.id !== upstreamId);
                    this.saveToStorage('upstreams', this.upstreamsData);
                    this.currentPage = 1;
                    this.displayUpstreamsWithPagination(this.upstreamsData);
                    this.updateUpstreamsStats();
                    
                    // 如果当前在概览页面，更新访问链路关系
                    if (this.currentPage === 'overview') {
                        this.updateOverviewAccessChains();
                    }
                    
                    this.showNotification('上游已删除，但数据刷新失败', 'warning');
                }
            } catch (error) {
                console.error('删除上游失败:', error);
                console.error('错误详情:', {
                    method: 'DELETE',
                    url: `/upstreams/${upstreamId}`,
                    error: error.message
                });
                
                // 检查是否是"上游正在被使用"的错误
                if (error.message && error.message.includes('400') && error.message.includes('Bad Request')) {
                    try {
                        // 检查是否有服务在使用这个上游
                        const servicesUsingUpstream = this.servicesData.filter(service => service.upstream === upstreamId);
                        if (servicesUsingUpstream.length > 0) {
                            const serviceNames = servicesUsingUpstream.map(s => s.name || s.id).join(', ');
                            this.showNotification(`无法删除上游：该上游正在被以下服务使用：${serviceNames}。请先删除或修改这些服务。`, 'warning');
                        } else {
                            this.showNotification(`删除失败：上游可能正在被其他资源使用，请检查后再试。`, 'warning');
                        }
                    } catch (parseError) {
                        this.showNotification(`删除失败：${error.message}`, 'error');
                    }
                } else {
                    this.showNotification(`删除失败: ${error.message}`, 'error');
                }
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }

    // 添加节点
    addNode() {
        const nodesContainer = document.getElementById('nodes-container');
        const nodeId = Date.now();
        const nodeHTML = `
            <div class="row mb-2" id="node-${nodeId}">
                <div class="col-md-4">
                    <input type="text" class="form-control" placeholder="主机地址 (如: api.example.com 或 192.168.1.100)" required>
                    <small class="form-text text-muted">支持域名或IP地址</small>
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control" placeholder="端口 (如: 443 或 8080)" min="1" max="65535" required>
                </div>
                <div class="col-md-3">
                    <input type="number" class="form-control" placeholder="权重 (如: 1)" min="1" max="100" value="1">
                </div>
                <div class="col-md-2">
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="document.getElementById('node-${nodeId}').remove()">
                        <i class="mdi mdi-delete"></i>
                    </button>
                </div>
            </div>
        `;
        nodesContainer.insertAdjacentHTML('beforeend', nodeHTML);
    }
    
    // 加载上游节点数据到表单
    loadUpstreamNodes(nodes) {
        const nodesContainer = document.getElementById('nodes-container');
        if (!nodesContainer) return;
        
        // 清空现有节点
        nodesContainer.innerHTML = '';
        
        if (nodes && nodes.length > 0) {
            // 加载现有节点
            nodes.forEach(node => {
                const nodeRow = document.createElement('div');
                nodeRow.className = 'row mb-2';
                const nodeId = Date.now() + Math.random();
                nodeRow.id = `node-${nodeId}`;
                nodeRow.innerHTML = `
                    <div class="col-md-4">
                        <input type="text" class="form-control" placeholder="主机地址 (如: api.example.com 或 192.168.1.100)" value="${node.host}" required>
                        <small class="form-text text-muted">支持域名或IP地址</small>
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control" placeholder="端口 (如: 443 或 8080)" value="${node.port}" min="1" max="65535" required>
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control" placeholder="权重 (如: 1)" value="${node.weight || 1}" min="1" max="100">
                    </div>
                    <div class="col-md-2">
                        <button type="button" class="btn btn-outline-danger btn-sm" onclick="document.getElementById('node-${nodeId}').remove()">
                            <i class="mdi mdi-delete"></i>
                        </button>
                    </div>
                `;
                
                nodesContainer.appendChild(nodeRow);
            });
        } else {
            // 如果没有节点，添加一个默认的空节点行
            this.addNode();
        }
    }

    loadPluginContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h4 class="card-title">插件管理</h4>
                            <p class="text-muted">选择要配置的插件类型</p>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="card border">
                                        <div class="card-body text-center">
                                            <i class="mdi mdi-key mdi-48px text-primary"></i>
                                            <h5 class="mt-3">key-auth</h5>
                                            <p class="text-muted">API密钥认证插件</p>
                                            <button class="btn btn-primary btn-sm">配置</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card border">
                                        <div class="card-body text-center">
                                            <i class="mdi mdi-shield mdi-48px text-success"></i>
                                            <h5 class="mt-3">cors</h5>
                                            <p class="text-muted">跨域资源共享插件</p>
                                            <button class="btn btn-success btn-sm">配置</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card border">
                                        <div class="card-body text-center">
                                            <i class="mdi mdi-speedometer mdi-48px text-warning"></i>
                                            <h5 class="mt-3">limit-req</h5>
                                            <p class="text-muted">请求限流插件</p>
                                            <button class="btn btn-warning btn-sm">配置</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 插件管理02：统一列表 + 搜索 + 分类筛选 + 配置模态
    async loadPlugin02Content(contentDiv) {
        console.log('=== 加载插件管理页面 ===');
        console.log('当前插件列表状态:', {
            allPlugins: this.allPlugins,
            allPluginsLength: this.allPlugins ? this.allPlugins.length : 0,
            pluginConfig: this.pluginConfig
        });
        
        // 确保插件列表已初始化
        if (!this.allPlugins || this.allPlugins.length === 0) {
            console.log('插件列表为空，开始初始化...');
            await this.initPlugins();
        }
        
        console.log('初始化后的插件列表:', {
            allPlugins: this.allPlugins,
            allPluginsLength: this.allPlugins ? this.allPlugins.length : 0
        });
        
        this.filteredPlugins = [...this.allPlugins];
        this.currentPluginCategory = 'all';
        this.currentPluginQuery = '';

        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div>
                                    <h4 class="card-title mb-1">插件管理</h4>
                                    <p class="text-muted mb-0">统一检索、筛选与快速配置</p>
                                </div>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.refreshPlugins02()">
                                        <i class="mdi mdi-refresh"></i> 刷新
                                    </button>
                                </div>
                            </div>

                            <div id="plugin02-stats" class="row mb-3"></div>

                            <div class="row mb-3">
                                <div class="col-12">
                                    <input id="plugin02-search" type="text" class="form-control" placeholder="搜索插件名称、别名、说明...">
                                </div>
                            </div>

                            <div id="plugin02-list" class="row g-4"></div>
                            
                            <!-- 配置模板列表 -->
                            <div class="mt-4">
                                <div class="card">
                                    <div class="card-body">
                                        <h5 class="card-title mb-3">
                                            <i class="mdi mdi-file-document-multiple"></i>
                                            配置模板管理
                                        </h5>
                                        <div id="plugin02-config-templates" class="row g-3"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 详情/配置 模态框 -->
            <div class="modal fade" id="plugin02Modal" tabindex="-1" role="dialog" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title d-flex align-items-center">
                                <i id="plugin02ModalIcon" class="mdi mdi-puzzle mdi-20px mr-2"></i>
                                <span id="plugin02ModalTitle">插件配置</span>
                            </h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true" class="text-white">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body" id="plugin02ModalBody" style="max-height: 70vh; overflow-y: auto;"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" onclick="window.apisixAdmin.savePlugin02Config()">保存配置模板</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 配置模板现在直接从etcd读取，不需要内存变量
        console.log('=== 插件管理页面配置模板状态 ===');
        console.log('配置模板现在直接从etcd读取');

        this.bindPlugin02Events();
        this.renderPlugin02Stats();
        this.renderPlugin02List();
        
        // 延迟渲染配置模板，确保etcd客户端已初始化
        setTimeout(() => {
            this.renderPluginConfigTemplates();
        }, 500);
    }

    bindPlugin02Events() {
        const search = document.getElementById('plugin02-search');
        const category = document.getElementById('plugin02-category');
        if (search) {
            search.addEventListener('input', (e) => {
                this.currentPluginQuery = e.target.value.trim().toLowerCase();
                this.renderPlugin02List();
            });
        }
        if (category) {
            category.addEventListener('change', (e) => {
                this.currentPluginCategory = e.target.value;
                this.renderPlugin02List();
            });
        }
    }

    async refreshPlugins02() {
        try {
            console.log('开始刷新插件列表...');
            // 重新加载配置文件
            const plugins = await this.buildMockPlugins();
            this.allPlugins = plugins;
            this.filteredPlugins = [...this.allPlugins];
            
            // 重新渲染
        this.renderPlugin02Stats();
        this.renderPlugin02List();
            
            this.showNotification('插件列表已刷新，配置已更新');
            console.log('插件列表刷新完成，数量:', this.allPlugins.length);
        } catch (error) {
            console.error('刷新插件列表失败:', error);
            this.showNotification('刷新失败: ' + error.message, 'error');
        }
    }

    // 初始化插件列表
    async initPlugins() {
        try {
            console.log('开始初始化插件列表...');
            const plugins = await this.buildMockPlugins();
            this.allPlugins = plugins;
            console.log('插件列表初始化完成，数量:', this.allPlugins.length);
            
            // 如果当前在插件管理页面，重新渲染
            if (this.currentPage === 'plugin02') {
                this.renderPlugin02List();
                this.renderPlugin02Stats();
            }
        } catch (error) {
            console.error('初始化插件列表失败:', error);
            // 使用默认配置
            this.allPlugins = this.buildDefaultPlugins();
        }
    }

    // 从配置文件加载插件信息
    async loadPluginConfig() {
        try {
            console.log('尝试加载插件配置文件...');
            
            // 首先尝试从网络加载
            try {
                const response = await fetch('config/plugin-config.json');
                if (response.ok) {
                    const config = await response.json();
                    console.log('成功加载插件配置文件:', config);
                    return config;
                }
            } catch (fetchError) {
                console.log('网络加载失败，尝试内嵌配置:', fetchError.message);
            }
            
            // 如果网络加载失败，使用内嵌配置
            return this.getEmbeddedConfig();
            
        } catch (error) {
            console.warn('无法加载插件配置文件，使用内嵌配置:', error);
            return this.getEmbeddedConfig();
        }
    }
    
    // 获取内嵌的插件配置
    getEmbeddedConfig() {
        console.log('使用内嵌的插件配置');
        return {
            "plugins": {
                "ai": {
                    "ai-proxy-custom": {
                        "title": "AI Proxy Custom",
                        "desc": "自定义AI代理，支持DeepSeek等模型服务",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-proxy": {
                        "title": "AI Proxy",
                        "desc": "统一AI代理，支持多家模型服务聚合",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-proxy-multi": {
                        "title": "AI Proxy Multi",
                        "desc": "多模型路由与熔断",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-rate-limiting": {
                        "title": "AI 限速",
                        "desc": "按模型/租户限流",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-prompt-guard": {
                        "title": "Prompt 审计",
                        "desc": "提示词治理与越狱防护",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-aws-content-moderation": {
                        "title": "AWS 内容审核",
                        "desc": "集成AWS内容安全",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-prompt-decorator": {
                        "title": "Prompt 装饰器",
                        "desc": "自动拼接系统提示词模板",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-prompt-template": {
                        "title": "Prompt 模板",
                        "desc": "模板管理与插值",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-rag": {
                        "title": "RAG",
                        "desc": "检索增强生成",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    },
                    "ai-request-rewrite": {
                        "title": "请求改写",
                        "desc": "在转发前动态改写AI请求",
                        "icon": "mdi-robot",
                        "color": "info",
                        "enabled": true
                    }
                },
                "auth": {
                    "key-auth": {
                        "title": "Key认证",
                        "desc": "基于API Key的认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "jwt-auth": {
                        "title": "JWT认证",
                        "desc": "基于JWT Token的认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "jwe-decrypt": {
                        "title": "JWE解密",
                        "desc": "JWE Token解密",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "basic-auth": {
                        "title": "基础认证",
                        "desc": "用户名密码基础认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "authz-keycloak": {
                        "title": "Keycloak授权",
                        "desc": "基于Keycloak的授权",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "authz-casdoor": {
                        "title": "Casdoor授权",
                        "desc": "基于Casdoor的授权",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "wolf-rbac": {
                        "title": "Wolf RBAC",
                        "desc": "基于角色的访问控制",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "openid-connect": {
                        "title": "OpenID Connect",
                        "desc": "OpenID Connect认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "cas-auth": {
                        "title": "CAS认证",
                        "desc": "CAS单点登录认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "hmac-auth": {
                        "title": "HMAC认证",
                        "desc": "基于HMAC的认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "authz-casbin": {
                        "title": "Casbin授权",
                        "desc": "基于Casbin的授权",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "ldap-auth": {
                        "title": "LDAP认证",
                        "desc": "LDAP目录服务认证",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "opa": {
                        "title": "OPA授权",
                        "desc": "基于OPA的策略授权",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "forward-auth": {
                        "title": "转发认证",
                        "desc": "转发认证请求",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    },
                    "multi-auth": {
                        "title": "多重认证",
                        "desc": "支持多种认证方式",
                        "icon": "mdi-key",
                        "color": "primary",
                        "enabled": true
                    }
                },
                "security": {
                    "cors": {
                        "title": "CORS",
                        "desc": "跨域资源共享控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "uri-blocker": {
                        "title": "URI Blocker",
                        "desc": "URI路径阻止",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ip-restriction": {
                        "title": "IP限制",
                        "desc": "基于IP地址的访问控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ua-restriction": {
                        "title": "UA限制",
                        "desc": "基于User-Agent的访问控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "referer-restriction": {
                        "title": "Referer限制",
                        "desc": "基于Referer的访问控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "consumer-restriction": {
                        "title": "消费者限制",
                        "desc": "基于消费者的访问控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "csrf": {
                        "title": "CSRF",
                        "desc": "跨站请求伪造防护",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "public-api": {
                        "title": "公开API",
                        "desc": "公开API访问控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "GM": {
                        "title": "GM",
                        "desc": "GM安全控制",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    },
                    "chaitin-waf": {
                        "title": "长亭WAF",
                        "desc": "长亭Web应用防火墙",
                        "icon": "mdi-shield-outline",
                        "color": "secondary",
                        "enabled": true
                    }
                },
                "traffic": {
                    "limit-req": {
                        "title": "限流",
                        "desc": "请求频率限制",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "limit-conn": {
                        "title": "连接限制",
                        "desc": "并发连接数限制",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "limit-count": {
                        "title": "计数限制",
                        "desc": "请求计数限制",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "proxy-cache": {
                        "title": "代理缓存",
                        "desc": "响应内容缓存",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "request-validation": {
                        "title": "请求验证",
                        "desc": "请求参数验证",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "proxy-mirror": {
                        "title": "代理镜像",
                        "desc": "请求镜像转发",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "api-breaker": {
                        "title": "API熔断器",
                        "desc": "API服务熔断保护",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "traffic-split": {
                        "title": "流量分割",
                        "desc": "流量分割与路由",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "request-id": {
                        "title": "请求ID",
                        "desc": "请求唯一标识",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "proxy-control": {
                        "title": "代理控制",
                        "desc": "代理行为控制",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "client-control": {
                        "title": "客户端控制",
                        "desc": "客户端行为控制",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    },
                    "workflow": {
                        "title": "工作流",
                        "desc": "请求处理工作流",
                        "icon": "mdi-speedometer",
                        "color": "warning",
                        "enabled": true
                    }
                },
                "observe": {
                    "prometheus": {
                        "title": "Prometheus",
                        "desc": "Prometheus指标收集",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    },
                    "skywalking": {
                        "title": "SkyWalking",
                        "desc": "SkyWalking链路追踪",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    },
                    "zipkin": {
                        "title": "Zipkin",
                        "desc": "Zipkin分布式链路追踪",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    },
                    "opentelemetry": {
                        "title": "OpenTelemetry",
                        "desc": "OpenTelemetry可观测性",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    },
                    "datadog": {
                        "title": "Datadog",
                        "desc": "Datadog监控集成",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    },
                    "node-status": {
                        "title": "节点状态",
                        "desc": "节点状态监控",
                        "icon": "mdi-chart-bar",
                        "color": "info",
                        "enabled": true
                    }
                },
                "serverless": {
                    "serverless": {
                        "title": "Serverless",
                        "desc": "无服务器函数",
                        "icon": "mdi-function-variant",
                        "color": "success",
                        "enabled": true
                    },
                    "azure-functions": {
                        "title": "Azure Functions",
                        "desc": "Azure函数计算",
                        "icon": "mdi-function-variant",
                        "color": "success",
                        "enabled": true
                    },
                    "openwhisk": {
                        "title": "OpenWhisk",
                        "desc": "Apache OpenWhisk",
                        "icon": "mdi-function-variant",
                        "color": "success",
                        "enabled": true
                    },
                    "aws-lambda": {
                        "title": "AWS Lambda",
                        "desc": "AWS Lambda函数",
                        "icon": "mdi-function-variant",
                        "color": "success",
                        "enabled": true
                    },
                    "openfunction": {
                        "title": "OpenFunction",
                        "desc": "OpenFunction函数",
                        "icon": "mdi-function-variant",
                        "color": "success",
                        "enabled": true
                    }
                },
                "log": {
                    "http-logger": {
                        "title": "HTTP日志",
                        "desc": "HTTP请求响应日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "skywalking-logger": {
                        "title": "SkyWalking日志",
                        "desc": "SkyWalking日志收集",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "tcp-logger": {
                        "title": "TCP日志",
                        "desc": "TCP协议日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "kafka-logger": {
                        "title": "Kafka日志",
                        "desc": "日志发送到Kafka",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "rocketmq-logger": {
                        "title": "RocketMQ日志",
                        "desc": "日志发送到RocketMQ",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "udp-logger": {
                        "title": "UDP日志",
                        "desc": "UDP协议日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "clickhouse-logger": {
                        "title": "ClickHouse日志",
                        "desc": "日志发送到ClickHouse",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "syslog": {
                        "title": "Syslog",
                        "desc": "系统日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "log-rotate": {
                        "title": "日志轮转",
                        "desc": "日志文件轮转",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "error-log-logger": {
                        "title": "错误日志",
                        "desc": "错误日志收集",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "sls-logger": {
                        "title": "SLS日志",
                        "desc": "阿里云SLS日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "google-cloud-logging": {
                        "title": "Google Cloud Logging",
                        "desc": "Google Cloud日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "splunk-hec-logging": {
                        "title": "Splunk HEC",
                        "desc": "Splunk HEC日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "file-logger": {
                        "title": "文件日志",
                        "desc": "日志写入文件",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "loggly": {
                        "title": "Loggly",
                        "desc": "Loggly日志服务",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "elasticsearch-logger": {
                        "title": "Elasticsearch日志",
                        "desc": "日志发送到ES",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "tencent-cloud-cls": {
                        "title": "腾讯云CLS",
                        "desc": "腾讯云日志服务",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "loki-logger": {
                        "title": "Loki日志",
                        "desc": "Grafana Loki日志",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "lago": {
                        "title": "Lago",
                        "desc": "Lago日志服务",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    },
                    "token-counter": {
                        "title": "Token计数器",
                        "desc": "Token使用量统计",
                        "icon": "mdi-file-document",
                        "color": "dark",
                        "enabled": true
                    }
                },
                "transform": {
                    "response-rewrite": {
                        "title": "响应改写",
                        "desc": "动态修改响应内容",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "proxy-rewrite": {
                        "title": "代理改写",
                        "desc": "动态修改代理请求",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "grpc-transcode": {
                        "title": "gRPC转码",
                        "desc": "gRPC协议转码",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "grpc-web": {
                        "title": "gRPC-Web",
                        "desc": "gRPC-Web协议支持",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "fault-injection": {
                        "title": "故障注入",
                        "desc": "故障注入测试",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "mocking": {
                        "title": "Mock服务",
                        "desc": "模拟服务响应",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "degraphql": {
                        "title": "DeGraphQL",
                        "desc": "GraphQL协议处理",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "webassembly": {
                        "title": "WebAssembly",
                        "desc": "WebAssembly执行",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "body-transformer": {
                        "title": "Body转换器",
                        "desc": "请求体转换",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    },
                    "attach-consumer-label": {
                        "title": "消费者标签",
                        "desc": "附加消费者标签",
                        "icon": "mdi-sync",
                        "color": "secondary",
                        "enabled": true
                    }
                },
                "general": {
                    "batch-requests": {
                        "title": "批量请求",
                        "desc": "批量请求处理",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "redirect": {
                        "title": "重定向",
                        "desc": "HTTP重定向处理",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "echo": {
                        "title": "Echo",
                        "desc": "请求回显测试",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "gzip": {
                        "title": "Gzip压缩",
                        "desc": "响应Gzip压缩",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "brotli": {
                        "title": "Brotli压缩",
                        "desc": "响应Brotli压缩",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "real-ip": {
                        "title": "真实IP",
                        "desc": "获取真实客户端IP",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "server-info": {
                        "title": "服务器信息",
                        "desc": "服务器信息展示",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ext-plugin-pre-req": {
                        "title": "外部插件预处理",
                        "desc": "请求前外部插件",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ext-plugin-post-req": {
                        "title": "外部插件后处理",
                        "desc": "请求后外部插件",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ext-plugin-post-resp": {
                        "title": "外部插件响应后",
                        "desc": "响应后外部插件",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "inspect": {
                        "title": "请求检查",
                        "desc": "请求内容检查",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    },
                    "ocsp-stapling": {
                        "title": "OCSP装订",
                        "desc": "OCSP状态装订",
                        "icon": "mdi-cog",
                        "color": "secondary",
                        "enabled": true
                    }
                },
                "other": {
                    "dubbo-proxy": {
                        "title": "Dubbo代理",
                        "desc": "Dubbo协议代理",
                        "icon": "mdi-dots-horizontal",
                        "color": "secondary",
                        "enabled": true
                    },
                    "mqtt-proxy": {
                        "title": "MQTT代理",
                        "desc": "MQTT协议代理",
                        "icon": "mdi-dots-horizontal",
                        "color": "secondary",
                        "enabled": true
                    },
                    "kafka-proxy": {
                        "title": "Kafka代理",
                        "desc": "Kafka协议代理",
                        "icon": "mdi-dots-horizontal",
                        "color": "secondary",
                        "enabled": true
                    },
                    "http-dubbo": {
                        "title": "HTTP-Dubbo",
                        "desc": "HTTP到Dubbo转换",
                        "icon": "mdi-dots-horizontal",
                        "color": "secondary",
                        "enabled": true
                    }
                }
            },
            "categories": {
                "all": "全部",
                "ai": "AI插件",
                "auth": "认证插件",
                "security": "安全插件",
                "traffic": "流量控制插件",
                "observe": "可观测性插件",
                "serverless": "无服务插件",
                "log": "日志插件",
                "transform": "转换插件",
                "general": "通用插件",
                "other": "其他插件"
            },
            "categoryIcons": {
                "all": "mdi-puzzle",
                "ai": "mdi-robot",
                "auth": "mdi-key",
                "security": "mdi-shield-outline",
                "traffic": "mdi-speedometer",
                "observe": "mdi-chart-bar",
                "serverless": "mdi-function-variant",
                "log": "mdi-file-document",
                "transform": "mdi-sync",
                "general": "mdi-cog",
                "other": "mdi-dots-horizontal"
            }
        };
    }

    // 构建插件列表（支持配置文件）
    async buildMockPlugins() {
        console.log('开始构建插件列表...');
        
        // 优先尝试从外部配置文件加载
        try {
            const config = await this.loadPluginConfig();
            
            if (config && config.plugins) {
                const arr = [];
                
                // 从配置文件构建插件列表
                Object.keys(config.plugins).forEach(category => {
                    Object.keys(config.plugins[category]).forEach(pluginName => {
                        const plugin = config.plugins[category][pluginName];
                        arr.push({
                            name: pluginName,
                            title: plugin.title || pluginName,
                            category: category,
                            desc: plugin.desc || '',
                            icon: plugin.icon || 'mdi-cog',
                            color: plugin.color || 'secondary',
                            enabled: plugin.enabled !== false
                        });
                    });
                });
                
                // 保存配置信息到实例变量，供其他方法使用
                this.pluginConfig = config;
                
                console.log(`成功从外部配置文件加载插件列表，共 ${arr.length} 个插件`);
                return arr;
            }
        } catch (error) {
            console.warn('外部配置文件加载失败，使用内嵌配置:', error);
        }
        
        // 如果外部配置加载失败，使用内嵌配置
        console.log('使用内嵌插件配置');
        const embeddedConfig = this.getEmbeddedConfig();
        
        if (embeddedConfig && embeddedConfig.plugins) {
            const arr = [];
            
            Object.keys(embeddedConfig.plugins).forEach(category => {
                Object.keys(embeddedConfig.plugins[category]).forEach(pluginName => {
                    const plugin = embeddedConfig.plugins[category][pluginName];
                    arr.push({
                        name: pluginName,
                        title: plugin.title || pluginName,
                        category: category,
                        desc: plugin.desc || '',
                        icon: plugin.icon || 'mdi-cog',
                        color: plugin.color || 'secondary',
                        enabled: plugin.enabled !== false
                    });
                });
            });
            
            this.pluginConfig = embeddedConfig;
            console.log(`成功从内嵌配置加载插件列表，共 ${arr.length} 个插件`);
            return arr;
        }
        
        // 如果都失败了，使用默认配置
        console.log('所有配置都失败，使用默认插件配置');
        return this.buildDefaultPlugins();
    }

    // 密码显示/隐藏切换函数
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = input.nextElementSibling;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'mdi mdi-eye-off';
            button.title = '隐藏密码';
        } else {
            input.type = 'password';
            icon.className = 'mdi mdi-eye';
            button.title = '显示密码';
        }
    }

    // 默认插件配置（备用方案）
    buildDefaultPlugins() {
        const make = (name, title, category, desc, icon, color) => ({ name, title, category, desc, icon, color });
        const arr = [];

        // AI 插件
        arr.push(
            make('ai-proxy-custom','AI Proxy Custom','ai','自定义AI代理，支持DeepSeek等模型服务','mdi-robot','info'),
            make('ai-proxy','AI Proxy','ai','统一AI代理，支持多家模型服务聚合','mdi-robot','info'),
            make('ai-proxy-multi','AI Proxy Multi','ai','多模型路由与熔断','mdi-robot','info'),
            make('ai-rate-limiting','AI 限速','ai','按模型/租户限流','mdi-robot','info'),
            make('ai-prompt-guard','Prompt 审计','ai','提示词治理与越狱防护','mdi-robot','info'),
            make('ai-aws-content-moderation','AWS 内容审核','ai','集成AWS内容安全','mdi-robot','info'),
            make('ai-prompt-decorator','Prompt 装饰器','ai','自动拼接系统提示词模板','mdi-robot','info'),
            make('ai-prompt-template','Prompt 模板','ai','模板管理与插值','mdi-robot','info'),
            make('ai-rag','RAG','ai','检索增强生成','mdi-robot','info'),
            make('ai-request-rewrite','请求改写','ai','在转发前动态改写AI请求','mdi-robot','info')
        );

        // 认证插件
        ['key-auth','jwt-auth','jwe-decrypt','basic-auth','authz-keycloak','authz-casdoor','wolf-rbac','openid-connect','cas-auth','hmac-auth','authz-casbin','ldap-auth','opa','forward-auth','multi-auth']
            .forEach(n => arr.push(make(n, n, 'auth', '认证与授权', 'mdi-key', 'primary')));

        // 安全插件
        [['cors','CORS'],['uri-blocker','URI Blocker'],['ip-restriction','IP 限制'],['ua-restriction','UA 限制'],['referer-restriction','Referer 限制'],['consumer-restriction','消费者限制'],['csrf','CSRF'],['public-api','公开API'],['GM','GM'],['chaitin-waf','长亭WAF']]
            .forEach(([n,t]) => arr.push(make(n, t, 'security', '安全与访问控制', 'mdi-shield-outline', 'secondary')));

        // 流量控制
        ['limit-req','limit-conn','limit-count','proxy-cache','request-validation','proxy-mirror','api-breaker','traffic-split','request-id','proxy-control','client-control','workflow']
            .forEach(n => arr.push(make(n, n, 'traffic', '流量治理与稳定性', 'mdi-speedometer', 'warning')));

        // 可观测性
        [['prometheus','Prometheus'],['skywalking','SkyWalking'],['zipkin','Zipkin'],['opentelemetry','OpenTelemetry'],['datadog','Datadog'],['node-status','node-status']]
            .forEach(([n,t]) => arr.push(make(n, t, 'observe', '监控与追踪', 'mdi-chart-bar', 'info')));

        // 无服务
        ['serverless','azure-functions','openwhisk','aws-lambda','openfunction']
            .forEach(n => arr.push(make(n, n, 'serverless', '集成函数计算', 'mdi-function-variant', 'success')));

        // 日志
        ['http-logger','skywalking-logger','tcp-logger','kafka-logger','rocketmq-logger','udp-logger','clickhouse-logger','syslog','log-rotate','error-log-logger','sls-logger','google-cloud-logging','splunk-hec-logging','file-logger','loggly','elasticsearch-logger','tencent-cloud-cls','loki-logger','lago','token-counter']
            .forEach(n => arr.push(make(n, n, 'log', '日志采集与投递', 'mdi-file-document', 'dark')));

        // 转换
        ['response-rewrite','proxy-rewrite','grpc-transcode','grpc-web','fault-injection','mocking','degraphql','webassembly','body-transformer','attach-consumer-label']
            .forEach(n => arr.push(make(n, n, 'transform', '请求/响应转换', 'mdi-sync', 'secondary')));

        // 通用
        ['batch-requests','redirect','echo','gzip','brotli','real-ip','server-info','ext-plugin-pre-req','ext-plugin-post-req','ext-plugin-post-resp','inspect','ocsp-stapling']
            .forEach(n => arr.push(make(n, n, 'general', '通用增强', 'mdi-cog', 'secondary')));

        // 其他
        ['dubbo-proxy','mqtt-proxy','kafka-proxy','http-dubbo']
            .forEach(n => arr.push(make(n, n, 'other', '其他协议/能力', 'mdi-dots-horizontal', 'secondary')));

        return arr;
    }

    renderPlugin02List() {
        const container = document.getElementById('plugin02-list');
        if (!container) return;

        let list = this.allPlugins;
        if (this.currentPluginCategory && this.currentPluginCategory !== 'all') {
            list = list.filter(p => p.category === this.currentPluginCategory);
        }
        if (this.currentPluginQuery) {
            const q = this.currentPluginQuery;
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.desc && p.desc.toLowerCase().includes(q))
            );
        }

        if (list.length === 0) {
            container.innerHTML = `<div class="col-12 text-center text-muted py-5">未找到相关插件</div>`;
            return;
        }

        container.innerHTML = list.map(p => `
            <div class="col-xl-2 col-lg-2 col-md-3 col-sm-4 col-6 mb-4">
                <div class="card h-100 border shadow-sm">
                    <div class="card-body d-flex flex-column align-items-start p-3">
                        <div class="d-flex align-items-center w-100 mb-3">
                            <span class="badge bg-${p.color} mr-2">${this.getPlugin02CategoryLabel(p.category)}</span>
                            <div class="ml-auto form-check form-switch">
                                <input class="form-check-input" type="checkbox" ${p.enabled ? 'checked' : ''} onchange="window.apisixAdmin.togglePlugin02('${p.name}', this.checked)">
                            </div>
                        </div>
                        <div class="text-${p.color} mb-3">
                            <i class="mdi ${p.icon} mdi-24px"></i>
                        </div>
                        <h5 class="mt-2 mb-2">${p.title || p.name}</h5>
                        <p class="text-muted flex-grow-1 mb-3">${p.desc || ''}</p>
                        <div class="mt-auto w-100 d-flex justify-content-between">
                            <button class="btn btn-sm btn-link text-primary p-0 border-0 shadow-none" onclick="window.apisixAdmin.viewPlugin02('${p.name}')" 
                                style="text-decoration: none; transition: all 0.2s ease; border-radius: 4px; padding: 4px 8px;" 
                                onmouseover="this.style.backgroundColor='rgba(13, 110, 253, 0.1)'" 
                                onmouseout="this.style.backgroundColor='transparent'">
                                <i class="mdi mdi-eye me-1"></i>查看
                            </button>
                            <button class="btn btn-sm btn-link text-primary p-0 border-0 shadow-none" onclick="window.apisixAdmin.configPlugin02('${p.name}')" 
                                style="text-decoration: none; transition: all 0.2s ease; border-radius: 4px; padding: 4px 8px;" 
                                onmouseover="this.style.backgroundColor='rgba(13, 110, 253, 0.1)'" 
                                onmouseout="this.style.backgroundColor='transparent'">
                                <i class="mdi mdi-cog me-1"></i>配置
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // 添加配置模板列表
        this.renderPluginConfigTemplates();
    }

    // 分类统计
    renderPlugin02Stats() {
        const statsContainer = document.getElementById('plugin02-stats');
        if (!statsContainer) return;
        const categories = ['all','ai','auth','security','traffic','observe','serverless','log','transform','general','other'];
        const counts = {};
        categories.forEach(c => counts[c] = 0);
        this.allPlugins.forEach(p => {
            counts[p.category] = (counts[p.category] || 0) + 1;
            counts['all'] = (counts['all'] || 0) + 1;
        });

        const chip = (cat) => `
            <div class="col-md-3 col-sm-4 col-6 mb-2">
                <button class="btn btn-${this.currentPluginCategory===cat?'primary':'light'} w-100 d-flex justify-content-between align-items-center"
                    onclick="window.apisixAdmin.setPlugin02Category('${cat}')">
                    <span><i class="mdi ${this.getPlugin02CategoryIcon(cat)}"></i> ${this.getPlugin02CategoryLabel(cat)}</span>
                    <span class="badge ${this.currentPluginCategory===cat?'bg-light text-dark':'bg-secondary'}">${counts[cat]||0}</span>
                </button>
            </div>`;

        statsContainer.innerHTML = categories.map(chip).join('');
    }

    setPlugin02Category(cat) {
        this.currentPluginCategory = cat;
        const select = document.getElementById('plugin02-category');
        if (select) select.value = cat;
        this.renderPlugin02Stats();
        this.renderPlugin02List();
    }

    getPlugin02CategoryLabel(cat) {
        // 优先使用配置文件中的分类标签
        if (this.pluginConfig && this.pluginConfig.categories && this.pluginConfig.categories[cat]) {
            return this.pluginConfig.categories[cat];
        }
        
        // 备用默认分类标签
        const defaultMap = {
            all: '全部',
            ai: 'AI插件',
            auth: '认证插件',
            security: '安全插件',
            traffic: '流量控制插件',
            observe: '可观测性插件',
            serverless: '无服务插件',
            log: '日志插件',
            transform: '转换插件',
            general: '通用插件',
            other: '其他插件'
        };
        return defaultMap[cat] || cat;
    }

    // 渲染配置模板列表
    async renderPluginConfigTemplates() {
        console.log('=== 开始渲染配置模板列表 ===');
        const container = document.getElementById('plugin02-config-templates');
        if (!container) {
            console.log('配置模板容器不存在'); // 调试信息
            return;
        }
        console.log('找到配置模板容器:', container);

        // 直接从etcd读取数据
        const templates = await this.etcdClient.getTemplates();
        console.log('渲染配置模板列表，模板数量:', templates.length); // 调试信息
        console.log('模板数据:', templates); // 调试信息
        
        if (templates.length === 0) {
            console.log('没有配置模板，显示空状态');
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="mdi mdi-information-outline"></i>
                        还没有配置模板，请在插件配置中创建
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="mb-0">
                        <i class="mdi mdi-file-document-multiple"></i>
                        配置模板 (${templates.length})
                    </h5>
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.apisixAdmin.clearAllConfigTemplates()">
                        <i class="mdi mdi-delete-sweep"></i> 清空所有
                    </button>
                </div>
            </div>
            ${templates.map(template => `
                <div class="col-xl-3 col-lg-4 col-md-6 col-sm-6 mb-3">
                    <div class="card border">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="badge bg-info">${template.plugin_name}</span>
                                <small class="text-muted">${new Date(template.updated_at).toLocaleDateString()}</small>
                            </div>
                            <h6 class="card-title mb-2" data-template-name="${template.name}">${template.name}</h6>
                            <p class="card-text text-muted small">${template.description || '无描述'}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <button class="btn btn-sm btn-outline-primary" onclick="window.apisixAdmin.editPluginConfigTemplate('${template.id}')">
                                    <i class="mdi mdi-pencil"></i> 编辑
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="window.apisixAdmin.deletePluginConfigTemplate('${template.id}')">
                                    <i class="mdi mdi-delete"></i> 删除
                                </button>
                            </div>
                            <div class="mt-2">
                                <small class="text-muted">
                                    创建: ${new Date(template.created_at).toLocaleDateString()}
                                    ${template.updated_at !== template.created_at ? 
                                        ` | 更新: ${new Date(template.updated_at).toLocaleDateString()}` : ''}
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}`;
        
        console.log('配置模板HTML已渲染到容器'); // 调试信息
        console.log('容器最终HTML长度:', container.innerHTML.length); // 调试信息
        
        // 调试：检查渲染后的模板名称
        const renderedTemplates = container.querySelectorAll('[data-template-name]');
        console.log('渲染后的模板元素数量:', renderedTemplates.length);
        renderedTemplates.forEach((element, index) => {
            const dataName = element.getAttribute('data-template-name');
            const textContent = element.textContent;
            const innerHTML = element.innerHTML;
            console.log(`模板${index + 1}:`, {
                dataName: dataName,
                textContent: textContent,
                innerHTML: innerHTML,
                length: textContent.length,
                charCodes: Array.from(textContent).map(c => c.charCodeAt(0))
            });
        });
    }

    // 检查插件是否有配置名称和描述字段
    pluginHasConfigFields(pluginName) {
        // 这些插件有完整的配置表单（包含配置名称和描述字段）
        const pluginsWithConfigFields = [
            'ai-proxy-custom',
            'ai-proxy',
            'ai-proxy-multi',
            'ai-rate-limiting',
            'ai-prompt-guard',
            'ai-aws-content-moderation',
            'ai-prompt-decorator',
            'ai-prompt-template',
            'ai-rag',
            'token-counter',
            'cors'
        ];
        
        // 如果插件在列表中，或者不在特殊处理列表中，都认为有配置字段
        return pluginsWithConfigFields.includes(pluginName) || !this.pluginHasSpecialForm(pluginName);
    }
    
    // 检查插件是否有特殊的表单（不使用wrap函数）
    pluginHasSpecialForm(pluginName) {
        const pluginsWithSpecialForm = [
            'ai-request-rewrite',
            'key-auth',
            'jwt-auth',
            'cors'
        ];
        return pluginsWithSpecialForm.includes(pluginName);
    }

    getPlugin02CategoryIcon(cat) {
        // 优先使用配置文件中的分类图标
        if (this.pluginConfig && this.pluginConfig.categoryIcons && this.pluginConfig.categoryIcons[cat]) {
            return this.pluginConfig.categoryIcons[cat];
        }
        
        // 备用默认分类图标
        const defaultMap = {
            all: 'mdi-puzzle',
            ai: 'mdi-robot',
            auth: 'mdi-key',
            security: 'mdi-shield-outline',
            traffic: 'mdi-speedometer',
            observe: 'mdi-chart-bar',
            serverless: 'mdi-function-variant',
            log: 'mdi-file-document',
            transform: 'mdi-sync',
            general: 'mdi-cog',
            other: 'mdi-dots-horizontal'
        };
        return defaultMap[cat] || 'mdi-puzzle';
    }

    togglePlugin02(name, enabled) {
        const found = this.allPlugins.find(p => p.name === name);
        if (found) {
            found.enabled = enabled;
            // 保存插件启用状态到localStorage

            this.showNotification(`${name} 已${enabled ? '启用' : '禁用'}`);
        }
    }



    viewPlugin02(name) {
        const plugin = this.allPlugins.find(p => p.name === name);
        if (!plugin) return;
        const body = document.getElementById('plugin02ModalBody');
        const title = document.getElementById('plugin02ModalTitle');
        if (title) title.textContent = `${plugin.title || plugin.name} - 详情`;
        if (body) {
            body.innerHTML = `
                <div class="mb-2">
                    <span class="badge bg-${plugin.color}">${plugin.category}</span>
                </div>
                <p class="mb-2 text-muted">${plugin.desc || '暂无描述'}</p>
                <pre class="bg-light p-3 rounded"><code>${JSON.stringify(plugin, null, 2)}</code></pre>
            `;
        }
        $('#plugin02Modal').modal('show');
    }

    configPlugin02(name) {
        const plugin = this.allPlugins.find(p => p.name === name);
        if (!plugin) return;
        
        // 检查是否有正在编辑的配置模板
        if (this.currentEditingConfigTemplate && this.currentEditingConfigTemplate.plugin_name === name) {
            // 加载配置模板数据到插件配置中
            plugin.config = { ...plugin.config, ...this.currentEditingConfigTemplate.config };
            plugin.config.name = this.currentEditingConfigTemplate.name;
            plugin.config.description = this.currentEditingConfigTemplate.description;
        }
        
        const body = document.getElementById('plugin02ModalBody');
        const title = document.getElementById('plugin02ModalTitle');
        
        // 根据插件类型设置不同的标题
        const hasConfigFields = this.pluginHasConfigFields(name);
        if (title) {
            title.textContent = hasConfigFields ? 
                `${plugin.title || plugin.name} - 新建配置` : 
                `${plugin.title || plugin.name} - 配置`;
        }
        
        const icon = document.getElementById('plugin02ModalIcon');
        if (icon) {
            icon.className = `mdi ${plugin.icon || 'mdi-puzzle'} mdi-20px mr-2`;
            icon.classList.add(`text-${plugin.color || 'secondary'}`);
        }
        if (!plugin.config) plugin.config = {};
        if (body) {
            body.innerHTML = this.getPlugin02ConfigForm(plugin);
        }
        $('#plugin02Modal').modal('show');
        this.currentEditingPlugin02 = name;
    }

    async savePlugin02Config() {
        const name = this.currentEditingPlugin02;
        if (!name) return;
        const plugin = this.allPlugins.find(p => p.name === name);
        if (!plugin) return;

        // 检查插件是否有配置名称和描述字段
        const hasConfigFields = this.pluginHasConfigFields(name);

        // 获取配置名称和描述
        let configName, configDescription;
        if (hasConfigFields) {
            configName = document.getElementById('plugin02-config-name')?.value || `${name}-config`;
            configDescription = document.getElementById('plugin02-description')?.value || '';
        } else {
            // 对于没有配置字段的插件，使用插件名称作为配置名称
            // 使用安全的日期格式化，避免编码问题
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const safeDate = `${year}-${month}-${day}`;
            configName = `${name}-config-${safeDate}`;
            configDescription = `${plugin.title || plugin.name} configuration template`;
        }
        
        // 确保模板名称的编码正确
        console.log('原始模板名称:', configName);
        console.log('模板名称长度:', configName.length);
        console.log('模板名称字符编码:', Array.from(configName).map(c => c.charCodeAt(0)));
        
        // 检查是否已存在同名配置模板
        const existingTemplates = await this.getPluginConfigTemplates();
        const existingTemplate = existingTemplates.find(t => 
            t.plugin_name === name && t.name === configName
        );
        
        let configId, configTemplate;
        if (existingTemplate) {
            // 更新现有配置模板
            configId = existingTemplate.id;
            configTemplate = {
                ...existingTemplate,
                name: configName,
                description: configDescription,
                updated_at: new Date().toISOString()
            };
            console.log('更新现有配置模板:', configName);
        } else {
            // 创建新配置模板
            configId = `config_${name}_${Date.now()}`;
            configTemplate = {
                id: configId,
                name: configName,
                plugin_name: name,
                description: configDescription,
                config: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            console.log('创建新配置模板:', configName);
        }

        // 根据插件类型收集配置参数
        switch (name) {
            case 'ai-proxy':
                configTemplate.config = {
                    provider: document.getElementById('ai-provider')?.value || 'openai',
                    base_url: document.getElementById('ai-base-url')?.value || '',
                    api_key: document.getElementById('ai-api-key')?.value || '',
                    model: document.getElementById('ai-model')?.value || 'gpt-3.5-turbo',
                    timeout_ms: parseInt(document.getElementById('ai-timeout-ms')?.value || '30000'),
                    retry: parseInt(document.getElementById('ai-retry')?.value || '0')
                };
                break;
            case 'ai-proxy-multi':
                configTemplate.config = {
                    strategy: document.getElementById('ai-multi-strategy')?.value || 'latency',
                    providers: this.plugin02GetJSON('ai-multi-providers', []),
                    fallback_order: this.plugin02GetJSON('ai-multi-fallback', [])
                };
                break;
            case 'ai-rate-limiting':
                configTemplate.config = {
                    limit_per_minute: parseInt(document.getElementById('ai-rl-limit')?.value || '60'),
                    burst: parseInt(document.getElementById('ai-rl-burst')?.value || '0'),
                    key_scope: document.getElementById('ai-rl-scope')?.value || 'consumer',
                    window_seconds: parseInt(document.getElementById('ai-rl-window')?.value || '60')
                };
                break;
            case 'ai-prompt-guard':
                configTemplate.config = {
                    match_all_roles: document.getElementById('ai-pg-match-all-roles')?.checked !== false,
                    match_all_conversation_history: document.getElementById('ai-pg-match-all-history')?.checked !== false,
                    allow_patterns: document.getElementById('ai-pg-allow-patterns')?.value?.split('\n').map(s => s.trim()).filter(s => s) || ['.*'],
                    deny_patterns: document.getElementById('ai-pg-deny-patterns')?.value?.split('\n').map(s => s.trim()).filter(s => s) || [],
                    enable_opensearch_log: document.getElementById('ai-pg-opensearch-log')?.checked !== false,
                    opensearch_url: document.getElementById('ai-pg-opensearch-url')?.value || 'https://113.44.57.186:9200',
                    opensearch_index: document.getElementById('ai-pg-index')?.value || 'ai-proxy-logs',
                    opensearch_username: document.getElementById('ai-pg-opensearch-username')?.value || 'admin',
                    opensearch_password: document.getElementById('ai-pg-opensearch-password')?.value || 'admin'
                };
                break;
            case 'ai-proxy-custom':
                configTemplate.config = {
                    ai_model_url: document.getElementById('ai-custom-model-url')?.value || 'https://api.deepseek.com/v1/chat/completions',
                    ai_model_key: document.getElementById('ai-custom-model-key')?.value || '',
                    ai_model_name: document.getElementById('ai-custom-model-name')?.value || 'deepseek-chat',
                    provider: document.getElementById('ai-custom-provider')?.value || 'deepseek',
                    content_safety_url: document.getElementById('ai-custom-safety-url')?.value || 'https://api.deepseek.com/v1/chat/completions',
                    content_safety_key: document.getElementById('ai-custom-safety-key')?.value || '',
                    sensitive_types: document.getElementById('ai-custom-sensitive-types')?.value?.split(',').map(s => s.trim()).filter(s => s) || ['email', 'id_card', 'phone', 'bank_card', 'address', 'name'],
                    response_format: document.getElementById('ai-custom-response-format')?.value || 'json',
                    enable_input_check: document.getElementById('ai-custom-input-check')?.checked !== false,
                    enable_output_check: document.getElementById('ai-custom-output-check')?.checked !== false,
                    block_harmful_content: document.getElementById('ai-custom-block-harmful')?.checked !== false,
                    mask_sensitive_info: document.getElementById('ai-custom-mask-sensitive')?.checked !== false,
                    enable_opensearch_log: document.getElementById('ai-custom-opensearch-log')?.checked !== false,
                    opensearch_url: document.getElementById('ai-custom-opensearch-url')?.value || 'https://113.44.57.186:9200',
                    opensearch_index: document.getElementById('ai-custom-index')?.value || 'ai-proxy-logs',
                    opensearch_username: document.getElementById('ai-custom-opensearch-username')?.value || 'admin',
                    opensearch_password: document.getElementById('ai-custom-opensearch-password')?.value || 'admin',
                    timeout: parseInt(document.getElementById('ai-custom-timeout')?.value || '60000')
                };
                break;
            case 'key-auth':
                configTemplate.config = {
                    header: document.getElementById('keyauth-header')?.value || 'apikey',
                    query: document.getElementById('keyauth-query')?.value || 'apikey',
                    hide_credentials: document.getElementById('keyauth-hide')?.checked || false
                };
                break;
            case 'jwt-auth':
                configTemplate.config = {
                    algorithm: document.getElementById('jwt-alg')?.value || 'HS256',
                    clock_skew: parseInt(document.getElementById('jwt-clock-skew')?.value || '0'),
                    secret: document.getElementById('jwt-secret')?.value || '',
                    public_key: document.getElementById('jwt-public')?.value || '',
                    header: document.getElementById('jwt-header')?.value || 'Authorization',
                    query: document.getElementById('jwt-query')?.value || 'jwt',
                    cookie: document.getElementById('jwt-cookie')?.value || 'jwt'
                };
                break;
            case 'basic-auth':
                configTemplate.config = {
                    realm: document.getElementById('basic-realm')?.value || 'APISIX',
                    hide_credentials: document.getElementById('basic-hide')?.checked || false
                };
                break;
            case 'hmac-auth':
                configTemplate.config = {
                    algorithm: document.getElementById('hmac-alg')?.value || 'hmac-sha256',
                    clock_skew: parseInt(document.getElementById('hmac-skew')?.value || '0'),
                    in: document.getElementById('hmac-in')?.value || 'header'
                };
                break;
            case 'token-counter':
                configTemplate.config = {
                    opensearch_url: document.getElementById('token-counter-opensearch-url')?.value || 'https://113.44.57.186:9200',
                    opensearch_index: document.getElementById('token-counter-index')?.value || 'token-counter-logs',
                    opensearch_username: document.getElementById('token-counter-username')?.value || 'admin',
                    opensearch_password: document.getElementById('token-counter-password')?.value || 'admin',
                    count_input_tokens: document.getElementById('token-counter-input')?.checked !== false,
                    count_output_tokens: document.getElementById('token-counter-output')?.checked !== false,
                    track_user_sessions: document.getElementById('token-counter-sessions')?.checked !== false,
                    enable_opensearch_log: document.getElementById('token-counter-logging')?.checked !== false
                };
                break;
            case 'consumer-restriction':
                const whitelist = document.getElementById('cr-whitelist')?.value?.split('\n').map(s => s.trim()).filter(s => s) || [];
                const blacklist = document.getElementById('cr-blacklist')?.value?.split('\n').map(s => s.trim()).filter(s => s) || [];
                
                // 确保至少有一个列表不为空
                if (whitelist.length === 0 && blacklist.length === 0) {
                    // 如果两个都为空，默认设置白名单为通配符
                configTemplate.config = {
                        whitelist: ['*'],
                        blacklist: ['placeholder'],
                    run_on_preflight: document.getElementById('cr-preflight')?.checked || false
                };
                    console.log('consumer-restriction插件配置：两个列表都为空，设置默认值');
                } else {
                    configTemplate.config = {
                        whitelist: whitelist.length > 0 ? whitelist : ['placeholder'],
                        blacklist: blacklist.length > 0 ? blacklist : ['placeholder'],
                        run_on_preflight: document.getElementById('cr-preflight')?.checked || false
                    };
                }
                break;
            case 'cors':
                configTemplate.config = {
                    allow_origins: document.getElementById('cors-origins')?.value || '*',
                    allow_methods: document.getElementById('cors-methods')?.value || 'GET,POST,PUT,DELETE,OPTIONS',
                    allow_headers: document.getElementById('cors-headers')?.value || '*',
                    expose_headers: document.getElementById('cors-expose')?.value || '',
                    allow_credentials: document.getElementById('cors-cred')?.checked !== false,
                    max_age: parseInt(document.getElementById('cors-maxage')?.value || '86400'),
                    allow_origins_by_regex: this.plugin02GetJSON('cors-origins-regex', [])
                };
                break;
            default:
                // 其他插件使用通用备注
                configTemplate.config = {
                    note: document.getElementById('plugin02-note')?.value || ''
                };
        }

        // 保存配置模板到etcd
        try {
            console.log('=== 开始保存配置模板到etcd ===');
            console.log('etcd客户端状态:', this.etcdClient);
            console.log('要保存的模板:', configTemplate);
            
            if (this.etcdClient) {
                console.log('etcd客户端已初始化，开始保存...');
                const saveResult = await this.etcdClient.saveTemplate(configTemplate);
                console.log('配置模板保存结果:', saveResult);
                console.log('配置模板已保存到etcd');
                
                // 调试：立即尝试读取刚保存的数据
                console.log('=== 调试：立即读取刚保存的数据 ===');
                try {
                    const immediateTemplates = await this.etcdClient.getTemplates();
                    console.log('立即读取的模板数量:', immediateTemplates.length);
                    console.log('立即读取的模板:', immediateTemplates);
                } catch (error) {
                    console.error('立即读取失败:', error);
                }
                
                // 配置模板现在直接从etcd读取，不需要重新加载到内存
            } else {
                console.error('etcd客户端未初始化，无法保存配置模板');
                this.showNotification('etcd客户端未初始化，无法保存配置模板', 'error');
                return;
            }
        } catch (error) {
            console.error('保存配置模板到etcd失败:', error);
            console.error('错误详情:', error.stack);
            this.showNotification('保存配置模板失败: ' + error.message, 'error');
            return;
        }

        // 显示成功消息
        this.showNotification(`配置模板 "${configName}" 保存成功！`, 'success');

        // 刷新配置模板列表
        this.renderPluginConfigTemplates();

        // 关闭模态框
        $('#plugin02Modal').modal('hide');

        // 通用
        const enabled = document.getElementById('plugin02-enabled')?.checked;
        plugin.enabled = !!enabled;
        
        // 插件启用状态已保存到内存中
        console.log('插件启用状态已保存:', name, plugin.enabled);

        // 分类：AI 插件的专项配置
        if (!plugin.config) plugin.config = {};
        switch (plugin.name) {
            case 'ai-proxy':
                plugin.config.provider = this.plugin02Get('ai-provider');
                plugin.config.base_url = this.plugin02Get('ai-base-url');
                plugin.config.api_key = this.plugin02Get('ai-api-key');
                plugin.config.model = this.plugin02Get('ai-model');
                plugin.config.timeout_ms = this.plugin02GetNumber('ai-timeout-ms', 30000);
                plugin.config.retry = this.plugin02GetNumber('ai-retry', 0);
                break;
            case 'ai-proxy-multi':
                plugin.config.strategy = this.plugin02Get('ai-multi-strategy');
                plugin.config.providers = this.plugin02GetJSON('ai-multi-providers', []);
                plugin.config.fallback_order = this.plugin02GetJSON('ai-multi-fallback', []);
                break;
            case 'ai-rate-limiting':
                plugin.config.limit_per_minute = this.plugin02GetNumber('ai-rl-limit', 60);
                plugin.config.burst = this.plugin02GetNumber('ai-rl-burst', 0);
                plugin.config.key_scope = this.plugin02Get('ai-rl-scope');
                plugin.config.window_seconds = this.plugin02GetNumber('ai-rl-window', 60);
                break;
            case 'ai-prompt-guard':
                plugin.config.enable_input_scan = !!document.getElementById('ai-pg-input')?.checked;
                plugin.config.enable_output_scan = !!document.getElementById('ai-pg-output')?.checked;
                plugin.config.blocklist = (this.plugin02Get('ai-pg-blocklist') || '').split('\n').map(s => s.trim()).filter(Boolean);
                plugin.config.moderation_provider = this.plugin02Get('ai-pg-provider');
                plugin.config.action = this.plugin02Get('ai-pg-action');
                break;
            case 'ai-aws-content-moderation':
                plugin.config.region = this.plugin02Get('ai-aws-region');
                plugin.config.access_key_id = this.plugin02Get('ai-aws-ak');
                plugin.config.secret_access_key = this.plugin02Get('ai-aws-sk');
                plugin.config.confidence_threshold = this.plugin02GetNumber('ai-aws-threshold', 0.8);
                break;
            case 'ai-prompt-decorator':
                plugin.config.prefix = this.plugin02Get('ai-deco-prefix');
                plugin.config.suffix = this.plugin02Get('ai-deco-suffix');
                plugin.config.inject_position = this.plugin02Get('ai-deco-pos');
                plugin.config.enable_variables = !!document.getElementById('ai-deco-vars')?.checked;
                break;
            case 'ai-prompt-template':
                plugin.config.template_name = this.plugin02Get('ai-tpl-name');
                plugin.config.template_content = this.plugin02Get('ai-tpl-content');
                plugin.config.variables = this.plugin02GetJSON('ai-tpl-vars', {});
                break;
            case 'ai-rag':
                plugin.config.vector_store = this.plugin02Get('ai-rag-store');
                plugin.config.top_k = this.plugin02GetNumber('ai-rag-topk', 5);
                plugin.config.similarity_metric = this.plugin02Get('ai-rag-metric');
                plugin.config.base_url = this.plugin02Get('ai-rag-endpoint');
                plugin.config.api_key = this.plugin02Get('ai-rag-key');
                break;
            case 'ai-request-rewrite':
                plugin.config.rewrite_rules = this.plugin02GetJSON('ai-rr-rules', []);
                plugin.config.headers = this.plugin02GetJSON('ai-rr-headers', {});
                plugin.config.params = this.plugin02GetJSON('ai-rr-params', {});
                break;
            // ================= 保存：安全插件 =================
            case 'cors':
                // 处理配置名称和描述字段（wrap函数包含的字段）
                configTemplate.name = document.getElementById('plugin02-config-name')?.value || 'cors配置';
                configTemplate.description = document.getElementById('plugin02-description')?.value || '';
                // 设置CORS配置
                configTemplate.config = {
                    allow_origins: document.getElementById('cors-origins')?.value || '*',
                    allow_methods: document.getElementById('cors-methods')?.value || 'GET,POST,PUT,DELETE,OPTIONS',
                    allow_headers: document.getElementById('cors-headers')?.value || '*',
                    expose_headers: document.getElementById('cors-expose')?.value || '',
                    max_age: parseInt(document.getElementById('cors-maxage')?.value || '0'),
                    allow_credentials: !!document.getElementById('cors-cred')?.checked,
                    allow_origins_by_regex: this.plugin02GetJSON('cors-origins-regex', [])
                };
                break;
            case 'uri-blocker':
                plugin.config.block_rules = (this.plugin02Get('ub-rules') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.reject_code = this.plugin02GetNumber('ub-code', 403);
                plugin.config.case_insensitive = !!document.getElementById('ub-case')?.checked;
                break;
            case 'ip-restriction':
                plugin.config.whitelist = (this.plugin02Get('ip-whitelist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.blacklist = (this.plugin02Get('ip-blacklist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.rejected_code = this.plugin02GetNumber('ip-code', 403);
                break;
            case 'ua-restriction':
                plugin.config.whitelist = (this.plugin02Get('ua-whitelist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.blacklist = (this.plugin02Get('ua-blacklist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.rejected_code = this.plugin02GetNumber('ua-code', 403);
                break;
            case 'referer-restriction':
                plugin.config.whitelist = (this.plugin02Get('ref-whitelist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.blacklist = (this.plugin02Get('ref-blacklist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.rejected_code = this.plugin02GetNumber('ref-code', 403);
                plugin.config.allow_empty = !!document.getElementById('ref-allow-empty')?.checked;
                break;
            case 'consumer-restriction':
                plugin.config.whitelist = (this.plugin02Get('cr-whitelist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.blacklist = (this.plugin02Get('cr-blacklist') || '').split('\n').map(s=>s.trim()).filter(Boolean);
                plugin.config.run_on_preflight = !!document.getElementById('cr-preflight')?.checked;
                break;
            case 'csrf':
                plugin.config.header_name = this.plugin02Get('csrf-header') || 'X-CSRF-TOKEN';
                plugin.config.cookie_name = this.plugin02Get('csrf-cookie') || 'csrf_token';
                plugin.config.expires = this.plugin02GetNumber('csrf-expires', 7200);
                plugin.config.same_site = this.plugin02Get('csrf-samesite') || 'Lax';
                plugin.config.secure = !!document.getElementById('csrf-secure')?.checked;
                break;
            case 'public-api':
                plugin.config.uri = this.plugin02GetJSON('public-uris', []);
                break;
            case 'GM':
                plugin.config.mode = this.plugin02Get('gm-mode') || 'SM2';
                plugin.config.tls13_only = !!document.getElementById('gm-tls13')?.checked;
                plugin.config.cert = this.plugin02Get('gm-cert');
                break;
            case 'chaitin-waf':
                plugin.config.endpoint = this.plugin02Get('cw-endpoint');
                plugin.config.access_key = this.plugin02Get('cw-ak');
                plugin.config.secret_key = this.plugin02Get('cw-sk');
                plugin.config.mode = this.plugin02Get('cw-mode') || 'detect';
                plugin.config.block_code = this.plugin02GetNumber('cw-code', 403);
                break;
            // ================= 保存：流量控制插件 =================
            case 'limit-req':
                plugin.config.rate = this.plugin02GetNumber('lr-rate', 10);
                plugin.config.burst = this.plugin02GetNumber('lr-burst', 0);
                plugin.config.nodelay = !!document.getElementById('lr-nodelay')?.checked;
                plugin.config.key_type = this.plugin02Get('lr-key-type') || 'remote_addr';
                plugin.config.key = this.plugin02Get('lr-key-name');
                plugin.config.rejected_code = this.plugin02GetNumber('lr-code', 429);
                break;
            case 'limit-conn':
                plugin.config.conn = this.plugin02GetNumber('lc-conn', 100);
                plugin.config.burst = this.plugin02GetNumber('lc-burst', 0);
                plugin.config.default_conn_delay = this.plugin02GetNumber('lc-delay', 0);
                plugin.config.key_type = this.plugin02Get('lc-key-type') || 'remote_addr';
                plugin.config.key = this.plugin02Get('lc-key-name');
                plugin.config.rejected_code = this.plugin02GetNumber('lc-code', 503);
                break;
            case 'limit-count':
                plugin.config.count = this.plugin02GetNumber('lcnt-count', 100);
                plugin.config.time_window = this.plugin02GetNumber('lcnt-window', 60);
                plugin.config.rejected_code = this.plugin02GetNumber('lcnt-code', 429);
                plugin.config.key_type = this.plugin02Get('lcnt-key-type') || 'remote_addr';
                plugin.config.key = this.plugin02Get('lcnt-key-name');
                break;
            case 'proxy-cache':
                plugin.config.cache_zone = this.plugin02Get('pc-zone') || 'disk_cache_one';
                plugin.config.cache_ttl = this.plugin02GetNumber('pc-ttl', 300);
                plugin.config.cache_key = this.plugin02GetJSON('pc-keys', []);
                plugin.config.cache_http_status = this.plugin02GetJSON('pc-statuses', [200,301,404]);
                plugin.config.hide_cache_headers = !!document.getElementById('pc-hide')?.checked;
                plugin.config.cache_bypass = this.plugin02GetJSON('pc-bypass', []);
                plugin.config.no_cache = this.plugin02GetJSON('pc-nocache', []);
                break;
            case 'request-validation':
                plugin.config.header_schema = this.plugin02GetJSON('rv-header', null);
                plugin.config.query_schema = this.plugin02GetJSON('rv-query', null);
                plugin.config.body_schema = this.plugin02GetJSON('rv-body', null);
                plugin.config.rejected_code = this.plugin02GetNumber('rv-code', 400);
                break;
            case 'proxy-mirror':
                plugin.config.host = this.plugin02Get('pm-host');
                plugin.config.path = this.plugin02Get('pm-path');
                plugin.config.sample_ratio = this.plugin02GetNumber('pm-sample', 1);
                break;
            case 'api-breaker':
                plugin.config.unhealthy = plugin.config.unhealthy || {};
                plugin.config.healthy = plugin.config.healthy || {};
                plugin.config.unhealthy.http_statuses = this.plugin02GetJSON('ab-unhealthy', [500,502,503]);
                plugin.config.unhealthy.failures = this.plugin02GetNumber('ab-unhealthy-fail', 3);
                plugin.config.healthy.http_statuses = this.plugin02GetJSON('ab-healthy', [200,201,204]);
                plugin.config.healthy.successes = this.plugin02GetNumber('ab-healthy-succ', 3);
                plugin.config.break_response_code = this.plugin02GetNumber('ab-code', 502);
                plugin.config.max_breaker_sec = this.plugin02GetNumber('ab-duration', 30);
                break;
            case 'traffic-split':
                plugin.config.rules = this.plugin02GetJSON('ts-rules', []);
                break;
            case 'request-id':
                plugin.config.header_name = this.plugin02Get('rid-header') || 'X-Request-Id';
                plugin.config.generator = this.plugin02Get('rid-alg') || 'uuid';
                plugin.config.include_prefix = this.plugin02Get('rid-prefix') || '';
                plugin.config.include_in_response = !!document.getElementById('rid-resp')?.checked;
                break;
            case 'proxy-control':
                plugin.config.request_buffering = !!document.getElementById('pctl-req-buf')?.checked;
                plugin.config.response_buffering = !!document.getElementById('pctl-resp-buf')?.checked;
                plugin.config.http_version = this.plugin02Get('pctl-http') || '1.1';
                break;
            case 'client-control':
                plugin.config.max_body_size = this.plugin02GetNumber('cc-max', 10485760);
                plugin.config.rejected_code = this.plugin02GetNumber('cc-code', 413);
                break;
            case 'workflow':
                plugin.config.rules = this.plugin02GetJSON('wf-rules', null);
                plugin.config.timeout_ms = this.plugin02GetNumber('wf-timeout', 0);
                break;
            // ================= 保存：转换插件 =================
            case 'response-rewrite':
                plugin.config.status_code = this.plugin02GetNumber('rr-status', 200);
                plugin.config.headers = this.plugin02GetJSON('rr-headers', {});
                plugin.config.body = this.plugin02Get('rr-body');
                plugin.config.body_base64 = !!document.getElementById('rr-base64')?.checked;
                break;
            case 'proxy-rewrite':
                plugin.config.scheme = this.plugin02Get('pr-scheme') || 'http';
                plugin.config.host = this.plugin02Get('pr-host');
                plugin.config.uri = this.plugin02Get('pr-uri');
                plugin.config.regex_uri = this.plugin02GetJSON('pr-regex', null);
                plugin.config.headers = this.plugin02GetJSON('pr-headers', null);
                break;
            case 'grpc-transcode':
                plugin.config.proto_id = this.plugin02Get('gt-proto-id');
                plugin.config.service = this.plugin02Get('gt-service');
                plugin.config.method = this.plugin02Get('gt-method');
                plugin.config.deadline = this.plugin02GetNumber('gt-deadline', 0);
                break;
            case 'grpc-web':
                plugin.config.allow_origin = this.plugin02Get('gw-origin') || '*';
                plugin.config.allow_credentials = !!document.getElementById('gw-cred')?.checked;
                break;
            case 'fault-injection':
                plugin.config.abort = plugin.config.abort || {};
                plugin.config.delay = plugin.config.delay || {};
                plugin.config.abort.http_status = this.plugin02GetNumber('fi-abort', 0);
                plugin.config.abort.body = this.plugin02Get('fi-body');
                plugin.config.delay.fixed_delay_ms = this.plugin02GetNumber('fi-delay', 0);
                plugin.config.percentage = this.plugin02GetNumber('fi-percent', 0);
                break;
            case 'mocking':
                plugin.config.status_code = this.plugin02GetNumber('mk-status', 200);
                plugin.config.delay_ms = this.plugin02GetNumber('mk-delay', 0);
                plugin.config.headers = this.plugin02GetJSON('mk-headers', {});
                plugin.config.body = this.plugin02Get('mk-body');
                break;
            case 'degraphql':
                plugin.config.sdl = this.plugin02Get('dg-sdl');
                plugin.config.max_depth = this.plugin02GetNumber('dg-depth', 0);
                plugin.config.max_cost = this.plugin02GetNumber('dg-cost', 0);
                break;
            case 'webassembly':
                plugin.config.module = this.plugin02Get('wa-module');
                plugin.config.function = this.plugin02Get('wa-func');
                plugin.config.conf = this.plugin02GetJSON('wa-conf', null);
                break;
            case 'body-transformer':
                plugin.config.remove = this.plugin02GetJSON('bt-remove', []);
                plugin.config.replace = this.plugin02GetJSON('bt-replace', {});
                plugin.config.append = this.plugin02GetJSON('bt-append', {});
                plugin.config.content_type = this.plugin02Get('bt-ctype') || 'json';
                break;
            case 'attach-consumer-label':
                plugin.config.header = this.plugin02Get('acl-header') || 'X-Consumer-Label';
                plugin.config.overwrite = !!document.getElementById('acl-overwrite')?.checked;
                plugin.config.values = this.plugin02GetJSON('acl-values', []);
                break;
            default:
                // 其他插件使用通用备注
                plugin.note = this.plugin02Get('plugin02-note');
        }

        // 更新内存中的配置模板
        if (existingTemplate) {
            // 更新现有模板
            const index = existingTemplates.findIndex(t => t.id === configId);
            if (index >= 0) {
                existingTemplates[index] = configTemplate;
            }
        } else {
            // 添加新模板
            existingTemplates.push(configTemplate);
        }
        
        // 不再使用内存变量
        
        // 立即同步到文件（通过下载）
        // this.savePluginConfigTemplatesToFile(); // 此方法不存在，已注释

        $('#plugin02Modal').modal('hide');
        
        // 清理编辑状态
        this.currentEditingConfigTemplate = null;
        
        // 刷新列表
        this.renderPlugin02List();
        this.renderPluginConfigTemplates();
        this.showNotification(`配置模板 "${configName}" 已保存`);
    }

    // Helper: safely get values
    plugin02Get(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }
    plugin02GetNumber(id, def = 0) {
        const v = parseFloat(this.plugin02Get(id));
        return isNaN(v) ? def : v;
    }
    plugin02GetJSON(id, def) {
        const raw = this.plugin02Get(id);
        if (!raw) return def;
        try { return JSON.parse(raw); } catch { return def; }
    }

    getPlugin02ConfigForm(plugin) {
        // 安全地构建配置名称，避免编码问题
        const getDefaultConfigName = (pluginName) => {
            try {
                // 使用数组join方法，避免字符串拼接的编码问题
                return [pluginName, '配置'].join('');
            } catch (error) {
                console.error('构建默认配置名称失败:', error);
                return pluginName + '_config';
            }
        };
        
        const defaultConfigName = getDefaultConfigName(plugin.name);
        const configName = plugin.config.name || defaultConfigName;
        
        const configHeader = `
            <div class="form-group">
                <label class="form-label">Configuration Name</label>
                <input type="text" class="form-control" id="plugin02-config-name" placeholder="Enter configuration name" value="${configName}">
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea class="form-control" id="plugin02-description" rows="2" placeholder="Enter description">${plugin.config.description || ''}</textarea>
            </div>`;
            
        const enabledRow = `
            <div class="form-group">
                <label class="form-label d-block">是否启用</label>
                <div class="form-check form-switch mt-1">
                    <input class="form-check-input" type="checkbox" id="plugin02-enabled" ${plugin.enabled ? 'checked' : ''}>
                </div>
            </div>`;

        const wrap = (inner) => `<form id="plugin02-form">${configHeader}${inner}${enabledRow}</form>`;

        switch (plugin.name) {
            case 'ai-proxy-custom':
                return wrap(`
                    <!-- AI模型配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-robot me-2"></i>AI模型配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>AI模型URL
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-model-url" 
                                           value="${plugin.config.ai_model_url || 'https://api.deepseek.com/v1/chat/completions'}" 
                                           placeholder="https://api.deepseek.com/v1/chat/completions">
                                    <small class="form-text text-muted">API端点地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>AI模型密钥
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-custom-model-key" 
                                               value="${plugin.config.ai_model_key || ''}" 
                                               placeholder="sk-...">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-custom-model-key')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                        </div>
                                    <small class="form-text text-muted">API访问密钥</small>
                            </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>AI模型名称
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-model-name" 
                                           value="${plugin.config.ai_model_name || 'deepseek-chat'}" 
                                           placeholder="deepseek-chat">
                                    <small class="form-text text-muted">模型标识符</small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>服务提供商
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-provider" 
                                           value="${plugin.config.provider || 'deepseek'}" 
                                           placeholder="deepseek">
                                    <small class="form-text text-muted">服务提供商名称</small>
                    </div>
                            </div>
                            </div>
                        </div>

                    <!-- 内容安全检测区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>内容安全检测
                            </h6>
                    </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>内容安全URL
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-safety-url" 
                                           value="${plugin.config.content_safety_url || 'https://api.deepseek.com/v1/chat/completions'}" 
                                           placeholder="https://api.deepseek.com/v1/chat/completions">
                                    <small class="form-text text-muted">内容安全检测API地址</small>
                    </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>内容安全密钥
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-custom-safety-key" 
                                               value="${plugin.config.content_safety_key || ''}" 
                                               placeholder="sk-...">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-custom-safety-key')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">内容安全API密钥</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 敏感信息配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-alert-circle me-2"></i>敏感信息检测
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>敏感信息类型
                                </label>
                                <textarea class="form-control" rows="3" id="ai-custom-sensitive-types" 
                                          placeholder="email,id_card,phone,bank_card,address,name">${(plugin.config.sensitive_types || ['email', 'id_card', 'phone', 'bank_card', 'address', 'name']).join(',')}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    用逗号分隔的敏感信息类型列表
                                </small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-align-left me-1"></i>响应格式
                                </label>
                        <select class="form-select" id="ai-custom-response-format">
                                    <option ${plugin.config.response_format === 'json' ? 'selected' : ''} value="json">JSON格式</option>
                                    <option ${plugin.config.response_format === 'text' ? 'selected' : ''} value="text">文本格式</option>
                        </select>
                                <small class="form-text text-muted">检测结果的输出格式</small>
                    </div>
                        </div>
                    </div>

                    <!-- 功能开关区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-toggle-switch me-2"></i>功能开关
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-custom-input-check" 
                                               ${plugin.config.enable_input_check !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="ai-custom-input-check">
                                            <i class="mdi mdi-arrow-down-bold-circle me-1"></i>输入内容检测
                                        </label>
                                        <small class="form-text text-muted d-block">检测用户输入内容</small>
                        </div>
                                </div>
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-custom-output-check" 
                                               ${plugin.config.enable_output_check !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="ai-custom-output-check">
                                            <i class="mdi mdi-arrow-up-bold-circle me-1"></i>输出内容检测
                                        </label>
                                        <small class="form-text text-muted d-block">检测AI输出内容</small>
                        </div>
                                </div>
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-custom-block-harmful" 
                                               ${plugin.config.block_harmful_content !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="ai-custom-block-harmful">
                                            <i class="mdi mdi-block-helper me-1"></i>阻止有害内容
                                        </label>
                                        <small class="form-text text-muted d-block">自动阻止有害内容</small>
                        </div>
                                </div>
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-custom-mask-sensitive" 
                                               ${plugin.config.mask_sensitive_info !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="ai-custom-mask-sensitive">
                                            <i class="mdi mdi-mask me-1"></i>敏感信息脱敏
                                        </label>
                                        <small class="form-text text-muted d-block">自动脱敏敏感信息</small>
                        </div>
                    </div>
                            </div>
                        </div>
                    </div>

                    <!-- OpenSearch日志配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-database me-2"></i>OpenSearch日志配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                        <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="ai-custom-opensearch-log" 
                                           ${plugin.config.enable_opensearch_log !== false ? 'checked' : ''}>
                                    <label class="form-check-label fw-bold" for="ai-custom-opensearch-log">
                                        <i class="mdi mdi-log me-1"></i>启用OpenSearch日志
                                    </label>
                                    <small class="form-text text-muted d-block">将日志数据存储到OpenSearch</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>OpenSearch URL
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-opensearch-url" 
                                           value="${plugin.config.opensearch_url || 'https://113.44.57.186:9200'}" 
                                           placeholder="https://113.44.57.186:9200">
                                    <small class="form-text text-muted">OpenSearch服务地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-folder me-1"></i>索引名称
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-index" 
                                           value="${plugin.config.opensearch_index || 'ai-proxy-logs'}" 
                                           placeholder="ai-proxy-logs">
                                    <small class="form-text text-muted">日志存储索引</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account me-1"></i>用户名
                                    </label>
                                    <input type="text" class="form-control" id="ai-custom-opensearch-username" 
                                           value="${plugin.config.opensearch_username || 'admin'}" 
                                           placeholder="admin">
                                    <small class="form-text text-muted">OpenSearch用户名</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>密码
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-custom-opensearch-password" 
                                               value="${plugin.config.opensearch_password || 'admin'}" 
                                               placeholder="admin">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-custom-opensearch-password')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                        </div>
                                    <small class="form-text text-muted">OpenSearch密码</small>
                    </div>
                            </div>
                        </div>
                    </div>

                    <!-- 超时配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-timer me-2"></i>超时配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-clock-outline me-1"></i>API调用超时时间
                                </label>
                                <div class="input-group">
                                    <input type="number" class="form-control" id="ai-custom-timeout" 
                                           value="${plugin.config.timeout || 60000}" 
                                           placeholder="60000" min="1000" max="300000">
                                    <span class="input-group-text">毫秒</span>
                                </div>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    建议范围：1000-300000毫秒
                                </small>
                            </div>
                        </div>
                    </div>
                `);
            case 'ai-proxy':
                return wrap(`
                    <!-- 服务商配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-domain me-2"></i>服务商配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-account-group me-1"></i>服务商
                                </label>
                        <select class="form-select" id="ai-provider">
                            <option ${plugin.config.provider==='openai'?'selected':''} value="openai">OpenAI</option>
                            <option ${plugin.config.provider==='azure'?'selected':''} value="azure">Azure</option>
                            <option ${plugin.config.provider==='claude'?'selected':''} value="claude">Claude</option>
                                    <option ${plugin.config.provider==='gemini'?'selected':''} value="gemini">Gemini</option>
                                    <option ${plugin.config.provider==='custom'?'selected':''} value="custom">自定义</option>
                            </select>
                                <small class="form-text text-muted">选择AI服务提供商</small>
                        </div>
                        </div>
                        </div>

                    <!-- API配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-api me-2"></i>API配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>Base URL
                                    </label>
                                    <input type="text" class="form-control" id="ai-base-url" 
                                           value="${plugin.config.base_url||''}" 
                                           placeholder="https://api.openai.com/v1">
                                    <small class="form-text text-muted">API服务地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>API Key
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-api-key" 
                                               value="${plugin.config.api_key||''}" 
                                               placeholder="sk-...">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-api-key')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">API访问密钥</small>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-robot me-1"></i>默认模型
                                    </label>
                                    <input type="text" class="form-control" id="ai-model" 
                                           value="${plugin.config.model||''}" 
                                           placeholder="gpt-4o-mini">
                                    <small class="form-text text-muted">默认使用的AI模型</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-retry me-1"></i>重试次数
                                    </label>
                                    <input type="number" class="form-control" id="ai-retry" 
                                           value="${plugin.config.retry??0}" 
                                           min="0" max="10">
                                    <small class="form-text text-muted">API调用失败时的重试次数</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 性能配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-speedometer me-2"></i>性能配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-clock-outline me-1"></i>超时时间
                                </label>
                                <div class="input-group">
                                    <input type="number" class="form-control" id="ai-timeout-ms" 
                                           value="${plugin.config.timeout_ms??30000}" 
                                           min="1000" max="300000">
                                    <span class="input-group-text">毫秒</span>
                                </div>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    建议范围：1000-300000毫秒
                                </small>
                            </div>
                            </div>
                        </div>
                `);
            case 'ai-proxy-multi':
                return wrap(`
                    <!-- 路由策略配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-routes me-2"></i>路由策略配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-route me-1"></i>路由策略
                                </label>
                        <select class="form-select" id="ai-multi-strategy">
                                <option ${plugin.config.strategy==='latency'?'selected':''} value="latency">最小延迟</option>
                                <option ${plugin.config.strategy==='cost'?'selected':''} value="cost">最低成本</option>
                                <option ${plugin.config.strategy==='priority'?'selected':''} value="priority">优先级</option>
                                <option ${plugin.config.strategy==='fallback'?'selected':''} value="fallback">故障切换</option>
                            </select>
                                <small class="form-text text-muted">选择多服务商的路由策略</small>
                        </div>
                        </div>
                    </div>

                    <!-- 服务商配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-multiple me-2"></i>服务商配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>服务商配置(JSON 数组)
                                </label>
                                <textarea class="form-control" rows="5" id="ai-multi-providers" 
                                          placeholder='[{"provider":"openai","weight":1}]'>${plugin.config.providers?JSON.stringify(plugin.config.providers, null, 2):''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    每项示例: { provider, base_url, api_key, weight }
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- 故障切换配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-backup-restore me-2"></i>故障切换配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-numbered me-1"></i>回退顺序(JSON 数组)
                                </label>
                                <textarea class="form-control" rows="3" id="ai-multi-fallback" 
                                          placeholder='["openai","azure","claude"]'>${plugin.config.fallback_order?JSON.stringify(plugin.config.fallback_order, null, 2):''}</textarea>
                                <small class="form-text text-muted">服务商故障时的切换顺序</small>
                            </div>
                        </div>
                        </div>
                `);
            case 'ai-rate-limiting':
                return wrap(`
                    <!-- 限流配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-speedometer me-2"></i>限流配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>每分钟限额
                                    </label>
                                    <input type="number" class="form-control" id="ai-rl-limit" 
                                           value="${plugin.config.limit_per_minute??60}" 
                                           min="1" max="10000">
                                    <small class="form-text text-muted">每分钟允许的请求数量</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-flash me-1"></i>突发限制
                                    </label>
                                    <input type="number" class="form-control" id="ai-rl-burst" 
                                           value="${plugin.config.burst??0}" 
                                           min="0" max="1000">
                                    <small class="form-text text-muted">允许的突发请求数量</small>
                            </div>
                        </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-filter me-1"></i>限流维度
                                    </label>
                                <select class="form-select" id="ai-rl-scope">
                                    <option ${plugin.config.key_scope==='consumer'?'selected':''} value="consumer">按系统(consumer)</option>
                                    <option ${plugin.config.key_scope==='ip'?'selected':''} value="ip">按IP</option>
                                    <option ${plugin.config.key_scope==='model'?'selected':''} value="model">按模型</option>
                                </select>
                                    <small class="form-text text-muted">限流的应用范围</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>时间窗口
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="ai-rl-window" 
                                               value="${plugin.config.window_seconds??60}" 
                                               min="1" max="3600">
                                        <span class="input-group-text">秒</span>
                                    </div>
                                    <small class="form-text text-muted">限流统计的时间窗口</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'ai-prompt-guard':
                return wrap(`
                    <!-- 匹配策略配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-filter me-2"></i>匹配策略配置
                            </h6>
                                </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-pg-match-all-roles" 
                                               ${plugin.config.match_all_roles?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ai-pg-match-all-roles">
                                            <i class="mdi mdi-account-multiple me-1"></i>匹配所有角色
                                        </label>
                                        <small class="form-text text-muted d-block">检查所有用户角色</small>
                            </div>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-pg-match-all-history" 
                                               ${plugin.config.match_all_conversation_history?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ai-pg-match-all-history">
                                            <i class="mdi mdi-history me-1"></i>匹配所有对话历史
                                        </label>
                                        <small class="form-text text-muted d-block">检查完整对话历史</small>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>

                    <!-- 内容过滤配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>内容过滤配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-check-circle me-1"></i>允许模式(每行一个正则表达式)
                                </label>
                                <textarea class="form-control" rows="3" id="ai-pg-allow-patterns" 
                                          placeholder=".*">${(plugin.config.allow_patterns||['.*']).join('\n')}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    默认允许所有内容，每行一个正则表达式
                                </small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-close-circle me-1"></i>拒绝模式(每行一个正则表达式)
                                </label>
                                <textarea class="form-control" rows="4" id="ai-pg-deny-patterns" 
                                          placeholder="(暴力|色情|政治敏感|违法信息|自残|自杀)">${(plugin.config.deny_patterns||[]).join('\n')}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    每行一个正则表达式，匹配的内容将被拒绝
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- OpenSearch日志配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-database me-2"></i>OpenSearch日志配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                        <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="ai-pg-opensearch-log" 
                                           ${plugin.config.enable_opensearch_log !== false ? 'checked' : ''}>
                                    <label class="form-check-label fw-bold" for="ai-pg-opensearch-log">
                                        <i class="mdi mdi-log me-1"></i>启用OpenSearch日志
                                    </label>
                                    <small class="form-text text-muted d-block">将过滤日志存储到OpenSearch</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>OpenSearch URL
                                    </label>
                                    <input type="text" class="form-control" id="ai-pg-opensearch-url" 
                                           value="${plugin.config.opensearch_url || 'https://113.44.57.186:9200'}" 
                                           placeholder="https://113.44.57.186:9200">
                                    <small class="form-text text-muted">OpenSearch服务地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-folder me-1"></i>索引名称
                                    </label>
                                    <input type="text" class="form-control" id="ai-pg-index" 
                                           value="${plugin.config.opensearch_index || 'ai-proxy-logs'}" 
                                           placeholder="ai-proxy-logs">
                                    <small class="form-text text-muted">日志存储索引</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account me-1"></i>用户名
                                    </label>
                                    <input type="text" class="form-control" id="ai-pg-opensearch-username" 
                                           value="${plugin.config.opensearch_username || 'admin'}" 
                                           placeholder="admin">
                                    <small class="form-text text-muted">OpenSearch用户名</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>密码
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-pg-opensearch-password" 
                                               value="${plugin.config.opensearch_password || 'admin'}" 
                                               placeholder="admin">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-pg-opensearch-password')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">OpenSearch密码</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'ai-aws-content-moderation':
                return wrap(`
                    <!-- AWS配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-aws me-2"></i>AWS配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-earth me-1"></i>区域
                                    </label>
                                    <input type="text" class="form-control" id="ai-aws-region" 
                                           value="${plugin.config.region||'ap-southeast-1'}" 
                                           placeholder="ap-southeast-1">
                                    <small class="form-text text-muted">AWS服务区域</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-percent me-1"></i>置信度阈值
                                    </label>
                                    <div class="input-group">
                                        <input type="number" step="0.01" class="form-control" id="ai-aws-threshold" 
                                               value="${plugin.config.confidence_threshold??0.8}" 
                                               min="0" max="1">
                                        <span class="input-group-text">0-1</span>
                            </div>
                                    <small class="form-text text-muted">内容审核的置信度阈值</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>Access Key ID
                                    </label>
                                    <input type="text" class="form-control" id="ai-aws-ak" 
                                           value="${plugin.config.access_key_id||''}" 
                                           placeholder="AKIA...">
                                    <small class="form-text text-muted">AWS访问密钥ID</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key-variant me-1"></i>Secret Access Key
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="ai-aws-sk" 
                                               value="${plugin.config.secret_access_key||''}" 
                                               placeholder="...">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-aws-sk')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">AWS秘密访问密钥</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'ai-prompt-decorator':
                return wrap(`
                    <!-- 提示词配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-text me-2"></i>提示词配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-arrow-up me-1"></i>前置系统提示词
                                </label>
                                <textarea class="form-control" rows="3" id="ai-deco-prefix" 
                                          placeholder="You are a helpful assistant...">${plugin.config.prefix||''}</textarea>
                                <small class="form-text text-muted">在用户输入前添加的系统提示词</small>
                        </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-arrow-down me-1"></i>后置提示词
                                </label>
                                <textarea class="form-control" rows="3" id="ai-deco-suffix" 
                                          placeholder="Please provide a detailed response...">${plugin.config.suffix||''}</textarea>
                                <small class="form-text text-muted">在用户输入后添加的提示词</small>
                        </div>
                        </div>
                    </div>

                    <!-- 注入配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>注入配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-map-marker me-1"></i>注入位置
                                    </label>
                                <select class="form-select" id="ai-deco-pos">
                                    <option ${plugin.config.inject_position==='before'?'selected':''} value="before">请求前</option>
                                    <option ${plugin.config.inject_position==='after'?'selected':''} value="after">请求后</option>
                                </select>
                                    <small class="form-text text-muted">提示词注入的时机</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ai-deco-vars" 
                                               ${plugin.config.enable_variables?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ai-deco-vars">
                                            <i class="mdi mdi-variable me-1"></i>启用变量插值
                                        </label>
                                        <small class="form-text text-muted d-block">支持动态变量替换</small>
                                    </div>
                                </div>
                                </div>
                            </div>
                        </div>
                `);
            case 'ai-prompt-template':
                return wrap(`
                    <!-- 模板基础配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-file-document me-2"></i>模板基础配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>模板名称
                                    </label>
                                    <input type="text" class="form-control" id="ai-tpl-name" 
                                           value="${plugin.config.template_name||''}" 
                                           placeholder="customer_service_template">
                                    <small class="form-text text-muted">模板的唯一标识符</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-variable me-1"></i>变量配置(JSON)
                                    </label>
                                    <textarea class="form-control" rows="3" id="ai-tpl-vars" 
                                              placeholder='{"company":"ACME","role":"客服"}'>${plugin.config.variables?JSON.stringify(plugin.config.variables, null, 2):''}</textarea>
                                    <small class="form-text text-muted">模板中使用的变量定义</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 模板内容区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-align-left me-2"></i>模板内容
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-text me-1"></i>模板内容
                                </label>
                                <textarea class="form-control" rows="5" id="ai-tpl-content" 
                                          placeholder="You are a helpful assistant from {{company}}. Your role is {{role}}...">${plugin.config.template_content||''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    使用 {{变量名}} 语法进行变量插值
                                </small>
                            </div>
                        </div>
                        </div>
                `);
            case 'ai-rag':
                return wrap(`
                    <!-- 向量库配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-database me-2"></i>向量库配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-database me-1"></i>向量库类型
                                    </label>
                                <select class="form-select" id="ai-rag-store">
                                    <option ${plugin.config.vector_store==='milvus'?'selected':''} value="milvus">Milvus</option>
                                    <option ${plugin.config.vector_store==='pgvector'?'selected':''} value="pgvector">PGVector</option>
                                    <option ${plugin.config.vector_store==='pinecone'?'selected':''} value="pinecone">Pinecone</option>
                                </select>
                                    <small class="form-text text-muted">选择向量数据库类型</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>Top K
                                    </label>
                                    <input type="number" class="form-control" id="ai-rag-topk" 
                                           value="${plugin.config.top_k??5}" 
                                           min="1" max="100">
                                    <small class="form-text text-muted">检索最相似的文档数量</small>
                            </div>
                        </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-ruler me-1"></i>相似度度量
                                    </label>
                                <select class="form-select" id="ai-rag-metric">
                                    <option ${plugin.config.similarity_metric==='cosine'?'selected':''} value="cosine">Cosine</option>
                                    <option ${plugin.config.similarity_metric==='l2'?'selected':''} value="l2">L2</option>
                                </select>
                                    <small class="form-text text-muted">向量相似度计算方法</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>服务地址
                                    </label>
                                    <input type="text" class="form-control" id="ai-rag-endpoint" 
                                           value="${plugin.config.base_url||''}" 
                                           placeholder="http://localhost:8080">
                                    <small class="form-text text-muted">向量数据库服务地址</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- API认证配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>API认证配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-key-variant me-1"></i>API Key
                                </label>
                                <div class="input-group">
                                    <input type="password" class="form-control" id="ai-rag-key" 
                                           value="${plugin.config.api_key||''}" 
                                           placeholder="your-api-key">
                                    <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('ai-rag-key')">
                                        <i class="mdi mdi-eye"></i>
                                    </button>
                                </div>
                                <small class="form-text text-muted">向量数据库访问密钥</small>
                            </div>
                        </div>
                        </div>
                `);
            case 'ai-request-rewrite':
                return wrap(`
                    <!-- 改写规则配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-rewind me-2"></i>改写规则配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>改写规则(JSON 数组)
                                </label>
                                <textarea class="form-control" rows="5" id="ai-rr-rules" 
                                          placeholder='[{"match":{"path":"/v1/chat"},"set":{"model":"gpt-4o-mini"}}]'>${plugin.config.rewrite_rules?JSON.stringify(plugin.config.rewrite_rules, null, 2):''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    定义请求匹配和改写规则
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- 请求增强配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-plus-circle me-2"></i>请求增强配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>追加请求头(JSON)
                                    </label>
                                    <textarea class="form-control" rows="3" id="ai-rr-headers" 
                                              placeholder='{"X-Trace":"1","X-User-ID":"123"}'>${plugin.config.headers?JSON.stringify(plugin.config.headers, null, 2):''}</textarea>
                                    <small class="form-text text-muted">自动添加的HTTP请求头</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link-variant me-1"></i>追加查询参数(JSON)
                                    </label>
                                    <textarea class="form-control" rows="3" id="ai-rr-params" 
                                              placeholder='{"region":"us","version":"v1"}'>${plugin.config.params?JSON.stringify(plugin.config.params, null, 2):''}</textarea>
                                    <small class="form-text text-muted">自动添加的URL查询参数</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'token-counter':
                return wrap(`
                    <!-- OpenSearch配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-database me-2"></i>OpenSearch配置
                            </h6>
                    </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>OpenSearch URL
                                    </label>
                                    <input type="text" class="form-control" id="token-counter-opensearch-url" 
                                           value="${plugin.config.opensearch_url || 'https://113.44.57.186:9200'}" 
                                           placeholder="https://113.44.57.186:9200">
                                    <small class="form-text text-muted">OpenSearch服务地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-folder me-1"></i>索引名称
                                    </label>
                                    <input type="text" class="form-control" id="token-counter-index" 
                                           value="${plugin.config.opensearch_index || 'token-counter-logs'}" 
                                           placeholder="token-counter-logs">
                                    <small class="form-text text-muted">Token计数日志存储索引</small>
                        </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account me-1"></i>用户名
                                    </label>
                                    <input type="text" class="form-control" id="token-counter-username" 
                                           value="${plugin.config.opensearch_username || 'admin'}" 
                                           placeholder="admin">
                                    <small class="form-text text-muted">OpenSearch用户名</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>密码
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="token-counter-password" 
                                               value="${plugin.config.opensearch_password || 'admin'}" 
                                               placeholder="admin">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('token-counter-password')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                        </div>
                                    <small class="form-text text-muted">OpenSearch密码</small>
                    </div>
                            </div>
                        </div>
                    </div>

                    <!-- Token统计功能区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-counter me-2"></i>Token统计功能
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                            <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="token-counter-input" 
                                               ${plugin.config.count_input_tokens !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="token-counter-input">
                                            <i class="mdi mdi-arrow-down-bold-circle me-1"></i>统计输入Token数量
                                        </label>
                                        <small class="form-text text-muted d-block">统计用户输入的Token数量</small>
                            </div>
                                </div>
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="token-counter-output" 
                                               ${plugin.config.count_output_tokens !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="token-counter-output">
                                            <i class="mdi mdi-arrow-up-bold-circle me-1"></i>统计输出Token数量
                                        </label>
                                        <small class="form-text text-muted d-block">统计AI输出的Token数量</small>
                        </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 会话跟踪区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-group me-2"></i>会话跟踪
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="token-counter-sessions" 
                                               ${plugin.config.track_user_sessions !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="token-counter-sessions">
                                            <i class="mdi mdi-account-clock me-1"></i>跟踪用户会话
                                        </label>
                                        <small class="form-text text-muted d-block">记录用户会话信息</small>
                        </div>
                                </div>
                                <div class="col-md-6 mb-3">
                        <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="token-counter-logging" 
                                               ${plugin.config.enable_opensearch_log !== false ? 'checked' : ''}>
                                        <label class="form-check-label fw-bold" for="token-counter-logging">
                                            <i class="mdi mdi-log me-1"></i>启用OpenSearch日志
                                        </label>
                                        <small class="form-text text-muted d-block">将统计数据存储到OpenSearch</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'key-auth':
                return wrap(`
                    <!-- API密钥配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>API密钥配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>Header名称
                                    </label>
                                    <input type="text" class="form-control" id="keyauth-header" 
                                           value="${plugin.config.header||'apikey'}" 
                                           placeholder="apikey">
                                    <small class="form-text text-muted">API密钥的HTTP头名称</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>Query参数名
                                    </label>
                                    <input type="text" class="form-control" id="keyauth-query" 
                                           value="${plugin.config.query||'apikey'}" 
                                           placeholder="apikey">
                                    <small class="form-text text-muted">API密钥的查询参数名称</small>
                        </div>
                            </div>
                        </div>
                    </div>

                    <!-- 安全配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>安全配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="keyauth-hide" 
                                           ${plugin.config.hide_credentials?'checked':''}>
                                    <label class="form-check-label fw-bold" for="keyauth-hide">
                                        <i class="mdi mdi-eye-off me-1"></i>隐藏凭证
                                    </label>
                                    <small class="form-text text-muted d-block">认证后从请求中移除API密钥</small>
                                </div>
                            </div>
                        </div>
                        </div>
                `);
            case 'jwt-auth':
                return wrap(`
                    <!-- JWT算法配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-lock me-2"></i>JWT算法配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cog me-1"></i>签名算法
                                    </label>
                                <select class="form-select" id="jwt-alg">
                                        <option ${plugin.config.algorithm==='HS256'?'selected':''} value="HS256">HS256 (HMAC SHA256)</option>
                                        <option ${plugin.config.algorithm==='HS512'?'selected':''} value="HS512">HS512 (HMAC SHA512)</option>
                                        <option ${plugin.config.algorithm==='RS256'?'selected':''} value="RS256">RS256 (RSA SHA256)</option>
                                        <option ${plugin.config.algorithm==='ES256'?'selected':''} value="ES256">ES256 (ECDSA SHA256)</option>
                                </select>
                                    <small class="form-text text-muted">JWT签名算法类型</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>生命周期宽限期
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="jwt-lifetime-grace" 
                                               value="${plugin.config.lifetime_grace_period??0}" 
                                               min="0" max="3600">
                                        <span class="input-group-text">秒</span>
                            </div>
                                    <small class="form-text text-muted">Token过期后的宽限时间</small>
                        </div>
                        </div>
                        </div>
                            </div>

                    <!-- 密钥配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key-variant me-2"></i>密钥配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-key me-1"></i>HS密钥
                                </label>
                                <div class="input-group">
                                    <input type="password" class="form-control" id="jwt-secret" 
                                           value="${plugin.config.secret||''}" 
                                           placeholder="当algorithm=HS时使用">
                                    <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('jwt-secret')">
                                        <i class="mdi mdi-eye"></i>
                                    </button>
                                </div>
                                <small class="form-text text-muted">HMAC算法的密钥 (algorithm=HS)</small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-certificate me-1"></i>公钥
                                </label>
                                <textarea class="form-control" rows="3" id="jwt-public" 
                                          placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----">${plugin.config.public_key||''}</textarea>
                                <small class="form-text text-muted">RSA/ECDSA算法的公钥 (algorithm=RS/ES)</small>
                            </div>
                        </div>
                    </div>

                    <!-- 传递位置配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-list-bulleted me-2"></i>传递位置配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>Header名称
                                    </label>
                                    <input type="text" class="form-control" id="jwt-header" 
                                           value="${plugin.config.header||'Authorization'}" 
                                           placeholder="Authorization">
                                    <small class="form-text text-muted">JWT的HTTP头名称</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>Query名称
                                    </label>
                                    <input type="text" class="form-control" id="jwt-query" 
                                           value="${plugin.config.query||'jwt'}" 
                                           placeholder="jwt">
                                    <small class="form-text text-muted">JWT的查询参数名</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cookie me-1"></i>Cookie名称
                                    </label>
                                    <input type="text" class="form-control" id="jwt-cookie" 
                                           value="${plugin.config.cookie||'jwt'}" 
                                           placeholder="jwt">
                                    <small class="form-text text-muted">JWT的Cookie名称</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'basic-auth':
                return wrap(`
                    <!-- Basic认证配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-lock me-2"></i>Basic认证配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account me-1"></i>用户名
                                    </label>
                                    <input type="text" class="form-control" id="basic-username" 
                                           value="${plugin.config.username||''}" 
                                           placeholder="admin">
                                    <small class="form-text text-muted">Basic认证的用户名</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>密码
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="basic-password" 
                                               value="${plugin.config.password||''}" 
                                               placeholder="password">
                                        <button class="btn btn-outline-secondary" type="button" 
                                                onclick="togglePasswordVisibility('basic-password')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">Basic认证的密码</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 安全配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>安全配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="basic-hide" 
                                           ${plugin.config.hide_credentials?'checked':''}>
                                    <label class="form-check-label fw-bold" for="basic-hide">
                                        <i class="mdi mdi-eye-off me-1"></i>隐藏凭证
                                    </label>
                                    <small class="form-text text-muted d-block">认证后从请求中移除Basic认证头</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'hmac-auth':
                return wrap(`
                    <!-- HMAC算法配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-lock me-2"></i>HMAC算法配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cog me-1"></i>算法
                                    </label>
                                <select class="form-select" id="hmac-alg">
                                        <option ${plugin.config.algorithm==='hmac-sha1'?'selected':''} value="hmac-sha1">hmac-sha1 (SHA1)</option>
                                        <option ${plugin.config.algorithm==='hmac-sha256'?'selected':''} value="hmac-sha256">hmac-sha256 (SHA256)</option>
                                        <option ${plugin.config.algorithm==='hmac-sha512'?'selected':''} value="hmac-sha512">hmac-sha512 (SHA512)</option>
                                </select>
                                    <small class="form-text text-muted">HMAC签名算法类型</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>容忍时钟偏移
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="hmac-skew" 
                                               value="${plugin.config.clock_skew??300}" 
                                               min="1" max="3600">
                                        <span class="input-group-text">秒</span>
                            </div>
                                    <small class="form-text text-muted">允许的时钟偏差时间</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="hmac-validate-body" 
                                               ${plugin.config.validate_request_body?'checked':''}>
                                        <label class="form-check-label fw-bold" for="hmac-validate-body">
                                            <i class="mdi mdi-check-circle me-1"></i>验证请求体
                                        </label>
                                        <small class="form-text text-muted d-block">启用请求体验证</small>
                        </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 安全配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>安全配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="hmac-hide" 
                                           ${plugin.config.hide_credentials?'checked':''}>
                                    <label class="form-check-label fw-bold" for="hmac-hide">
                                        <i class="mdi mdi-eye-off me-1"></i>隐藏凭证
                                    </label>
                                    <small class="form-text text-muted d-block">认证后从请求中移除HMAC凭证</small>
                                </div>
                            </div>
                        </div>
                        </div>
                `);
            case 'ldap-auth':
                return wrap(`
                    <!-- LDAP连接配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-server me-2"></i>LDAP连接配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>LDAP URI
                                    </label>
                                    <input type="text" class="form-control" id="ldap-uri" 
                                           value="${plugin.config.ldap_uri||'ldap://ldap.example.com:389'}" 
                                           placeholder="ldap://ldap.example.com:389">
                                    <small class="form-text text-muted">LDAP服务器URI地址</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-folder me-1"></i>Base DN
                                    </label>
                                    <input type="text" class="form-control" id="ldap-base" 
                                           value="${plugin.config.base_dn||'dc=example,dc=com'}" 
                                           placeholder="dc=example,dc=com">
                                    <small class="form-text text-muted">LDAP搜索的基础DN</small>
                                </div>
                            </div>
                        </div>
                            </div>

                    <!-- LDAP安全配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>LDAP安全配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ldap-use-tls" 
                                               ${plugin.config.use_tls?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ldap-use-tls">
                                            <i class="mdi mdi-lock me-1"></i>使用TLS
                                        </label>
                                        <small class="form-text text-muted d-block">启用TLS加密连接</small>
                        </div>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ldap-tls-verify" 
                                               ${plugin.config.tls_verify?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ldap-tls-verify">
                                            <i class="mdi mdi-certificate me-1"></i>TLS验证
                                        </label>
                                        <small class="form-text text-muted d-block">验证TLS证书</small>
                                    </div>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account me-1"></i>UID属性
                                    </label>
                                    <input type="text" class="form-control" id="ldap-uid" 
                                           value="${plugin.config.uid||'cn'}" 
                                           placeholder="cn">
                                    <small class="form-text text-muted">用户标识属性名</small>
                                </div>
                            </div>
                        </div>
                        </div>
                `);
            case 'openid-connect':
                return wrap(`
                    <!-- OpenID Connect服务配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-key me-2"></i>OpenID Connect服务配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-link me-1"></i>Discovery URL
                                </label>
                                <input type="text" class="form-control" id="oidc-discovery" 
                                       value="${plugin.config.discovery||''}" 
                                       placeholder="https://idp/.well-known/openid-configuration">
                                <small class="form-text text-muted">OpenID Connect发现文档的URL地址</small>
                            </div>
                            </div>
                        </div>

                    <!-- 客户端配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-application me-2"></i>客户端配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-identifier me-1"></i>Client ID
                                    </label>
                                    <input type="text" class="form-control" id="oidc-client-id" 
                                           value="${plugin.config.client_id||''}" 
                                           placeholder="your-client-id">
                                    <small class="form-text text-muted">OAuth2客户端标识符</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key-variant me-1"></i>Client Secret
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="oidc-client-secret" 
                                               value="${plugin.config.client_secret||''}" 
                                               placeholder="your-client-secret">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('oidc-client-secret')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                        </div>
                                    <small class="form-text text-muted">OAuth2客户端密钥</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 认证配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>认证配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-bulleted me-1"></i>Scope
                                    </label>
                                    <input type="text" class="form-control" id="oidc-scope" 
                                           value="${plugin.config.scope||'openid profile email'}" 
                                           placeholder="openid profile email">
                                    <small class="form-text text-muted">请求的权限范围</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-redirect me-1"></i>Redirect URI
                                    </label>
                                    <input type="text" class="form-control" id="oidc-redirect" 
                                           value="${plugin.config.redirect_uri||''}" 
                                           placeholder="https://your-app/callback">
                                    <small class="form-text text-muted">认证成功后的回调地址</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 安全选项配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>安全选项配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="oidc-bearer-only" 
                                               ${plugin.config.bearer_only?'checked':''}>
                                        <label class="form-check-label fw-bold" for="oidc-bearer-only">
                                            <i class="mdi mdi-token me-1"></i>仅Bearer
                                        </label>
                                        <small class="form-text text-muted d-block">仅支持Bearer Token认证</small>
                                    </div>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="oidc-pkce" 
                                               ${plugin.config.use_pkce?'checked':''}>
                                        <label class="form-check-label fw-bold" for="oidc-pkce">
                                            <i class="mdi mdi-shield-key me-1"></i>启用PKCE
                                        </label>
                                        <small class="form-text text-muted d-block">启用Proof Key for Code Exchange</small>
                                    </div>
                                </div>
                                </div>
                            </div>
                        </div>
                `);
            case 'jwe-decrypt':
                return wrap(`
                    <!-- JWK配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key-wireless me-2"></i>JWK配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-link me-1"></i>JWK Set URL
                                </label>
                                <input type="text" class="form-control" id="jwe-jwks" 
                                       value="${plugin.config.jwk_set_url||''}" 
                                       placeholder="https://idp/.well-known/jwks.json">
                                <small class="form-text text-muted">JSON Web Key Set的URL地址</small>
                            </div>
                        </div>
                    </div>

                    <!-- 解密配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-lock me-2"></i>解密配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>密钥
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="jwe-key" 
                                               value="${plugin.config.key||''}" 
                                               placeholder="your-decryption-key">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('jwe-key')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">JWE解密的密钥</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cog me-1"></i>算法
                                    </label>
                                <select class="form-select" id="jwe-alg">
                                        <option ${plugin.config.alg==='A128KW'?'selected':''} value="A128KW">A128KW (AES-128 Key Wrap)</option>
                                        <option ${plugin.config.alg==='A256KW'?'selected':''} value="A256KW">A256KW (AES-256 Key Wrap)</option>
                                </select>
                                    <small class="form-text text-muted">密钥包装算法</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'authz-keycloak':
                return wrap(`
                    <!-- Keycloak服务配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-server me-2"></i>Keycloak服务配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-link me-1"></i>Keycloak URL
                                </label>
                                <input type="text" class="form-control" id="kc-endpoint" 
                                       value="${plugin.config.endpoint||''}" 
                                       placeholder="https://keycloak/">
                                <small class="form-text text-muted">Keycloak服务器的URL地址</small>
                            </div>
                        </div>
                    </div>

                    <!-- 认证配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-key me-2"></i>认证配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>Realm
                                    </label>
                                    <input type="text" class="form-control" id="kc-realm" 
                                           value="${plugin.config.realm||''}" 
                                           placeholder="your-realm">
                                    <small class="form-text text-muted">Keycloak的Realm名称</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-shield-check me-1"></i>Policy模式
                                    </label>
                                <select class="form-select" id="kc-mode">
                                        <option ${plugin.config.mode==='ENFORCING'?'selected':''} value="ENFORCING">ENFORCING (强制模式)</option>
                                        <option ${plugin.config.mode==='PERMISSIVE'?'selected':''} value="PERMISSIVE">PERMISSIVE (宽松模式)</option>
                                </select>
                                    <small class="form-text text-muted">权限策略的执行模式</small>
                            </div>
                        </div>
                            </div>
                    </div>

                    <!-- 客户端配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-application me-2"></i>客户端配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-identifier me-1"></i>Client ID
                                    </label>
                                    <input type="text" class="form-control" id="kc-client-id" 
                                           value="${plugin.config.client_id||''}" 
                                           placeholder="your-client-id">
                                    <small class="form-text text-muted">Keycloak客户端标识符</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key-variant me-1"></i>Client Secret
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="kc-client-secret" 
                                               value="${plugin.config.client_secret||''}" 
                                               placeholder="your-client-secret">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('kc-client-secret')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">Keycloak客户端密钥</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'authz-casdoor':
                return wrap(`
                    <!-- Casdoor服务配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-server me-2"></i>Casdoor服务配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-link me-1"></i>Endpoint
                                </label>
                                <input type="text" class="form-control" id="casdoor-endpoint" 
                                       value="${plugin.config.endpoint||''}" 
                                       placeholder="https://casdoor.example.com">
                                <small class="form-text text-muted">Casdoor服务器的URL地址</small>
                            </div>
                            </div>
                        </div>

                    <!-- 客户端配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-application me-2"></i>客户端配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-identifier me-1"></i>Client ID
                                    </label>
                                    <input type="text" class="form-control" id="casdoor-client-id" 
                                           value="${plugin.config.client_id||''}" 
                                           placeholder="your-client-id">
                                    <small class="form-text text-muted">Casdoor客户端标识符</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key-variant me-1"></i>Client Secret
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="casdoor-client-secret" 
                                               value="${plugin.config.client_secret||''}" 
                                               placeholder="your-client-secret">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('casdoor-client-secret')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                                    </div>
                                    <small class="form-text text-muted">Casdoor客户端密钥</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 组织配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-group me-2"></i>组织配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>Organization
                                    </label>
                                    <input type="text" class="form-control" id="casdoor-org" 
                                           value="${plugin.config.organization||''}" 
                                           placeholder="your-organization">
                                    <small class="form-text text-muted">Casdoor组织名称</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-application me-1"></i>Application
                                    </label>
                                    <input type="text" class="form-control" id="casdoor-app" 
                                           value="${plugin.config.application||''}" 
                                           placeholder="your-application">
                                    <small class="form-text text-muted">Casdoor应用名称</small>
                                </div>
                            </div>
                            </div>
                        </div>
                `);
            case 'authz-casbin':
                return wrap(`
                    <!-- Casbin模型配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shape me-2"></i>Casbin模型配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-file-document me-1"></i>Model
                                </label>
                                <textarea class="form-control" rows="4" id="casbin-model" 
                                          placeholder="[request_definition]&#10;r = sub, obj, act&#10;&#10;[policy_definition]&#10;p = sub, obj, act&#10;&#10;[policy_effect]&#10;e = some(where (p.eft == allow))&#10;&#10;[matchers]&#10;m = r.sub == p.sub && r.obj == p.obj && r.act == p.act">${plugin.config.model||''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    Casbin权限模型的配置内容
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- Casbin策略配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>Casbin策略配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>Policy
                                </label>
                                <textarea class="form-control" rows="4" id="casbin-policy" 
                                          placeholder="p, alice, /api/users, GET&#10;p, bob, /api/admin, POST&#10;p, admin, /api/*, *">${plugin.config.policy||''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    Casbin权限策略规则列表
                                </small>
                            </div>
                        </div>
                        </div>
                `);
            case 'wolf-rbac':
                return wrap(`
                        <div class="form-group">
                            <label class="form-label">服务地址</label>
                            <input type="text" class="form-control" id="wolf-server" value="${plugin.config.server||''}">
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label class="form-label">App Id</label>
                                <input type="text" class="form-control" id="wolf-appid" value="${plugin.config.app_id||''}">
                            </div>
                            <div class="form-group col-md-6">
                                <label class="form-label">App Secret</label>
                                <input type="password" class="form-control" id="wolf-secret" value="${plugin.config.app_secret||''}">
                            </div>
                        </div>
                `);
            case 'opa':
                return wrap(`
                        <div class="form-group">
                            <label class="form-label">OPA 服务地址</label>
                            <input type="text" class="form-control" id="opa-url" value="${plugin.config.url||''}" placeholder="http://opa:8181">
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label class="form-label">Policy 路径</label>
                                <input type="text" class="form-control" id="opa-path" value="${plugin.config.policy_path||'/v1/data/http/authz/allow'}">
                            </div>
                            <div class="form-group col-md-6 d-flex align-items-end">
                                <div class="form-check form-switch mt-2">
                                    <input class="form-check-input" type="checkbox" id="opa-input" ${plugin.config.with_input?'checked':''}>
                                    <label class="form-check-label" for="opa-input">传入请求上下文</label>
                                </div>
                            </div>
                        </div>
                `);
            case 'forward-auth':
                return wrap(`
                        <div class="form-group">
                            <label class="form-label">认证请求地址</label>
                            <input type="text" class="form-control" id="fa-uri" value="${plugin.config.auth_request_uri||''}" placeholder="/auth">
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label class="form-label">转发到上游的请求头(JSON)</label>
                                <textarea class="form-control" rows="3" id="fa-up">${plugin.config.upstream_headers?JSON.stringify(plugin.config.upstream_headers, null, 2):''}</textarea>
                            </div>
                            <div class="form-group col-md-6">
                                <label class="form-label">保留客户端请求头(JSON)</label>
                                <textarea class="form-control" rows="3" id="fa-client">${plugin.config.client_headers?JSON.stringify(plugin.config.client_headers, null, 2):''}</textarea>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">未认证处理</label>
                            <select class="form-select" id="fa-action">
                                <option ${plugin.config.unauth_action==='401'?'selected':''} value="401">返回401</option>
                                <option ${plugin.config.unauth_action==='redirect'?'selected':''} value="redirect">重定向</option>
                            </select>
                        </div>
                `);
            case 'multi-auth':
                return wrap(`
                        <div class="form-group">
                            <label class="form-label">认证链(JSON 数组)</label>
                            <textarea class="form-control" rows="3" id="multiauth-chain" placeholder='["key-auth","jwt-auth"]'>${plugin.config.chain?JSON.stringify(plugin.config.chain, null, 2):''}</textarea>
                        </div>
                `);
            case 'cas-auth':
                return wrap(`
                        <div class="form-group">
                            <label class="form-label">CAS Server URL</label>
                            <input type="text" class="form-control" id="cas-server" value="${plugin.config.server_url||''}">
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label class="form-label">Login URL</label>
                                <input type="text" class="form-control" id="cas-login" value="${plugin.config.login_url||''}">
                            </div>
                            <div class="form-group col-md-6">
                                <label class="form-label">Validate URL</label>
                                <input type="text" class="form-control" id="cas-validate" value="${plugin.config.validate_url||''}">
                            </div>
                        </div>
                `);
            // ================= 安全插件 =================
            case 'cors':
                return wrap(`
                    <!-- Origin配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-earth me-2"></i>Origin配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>允许的Origin
                                    </label>
                                    <input type="text" class="form-control" id="cors-origins" 
                                           value="${plugin.config.allow_origins||'*'}" 
                                           placeholder="https://a.com,https://b.com 或 *">
                                    <small class="form-text text-muted">逗号分隔的域名列表，*表示允许所有</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-regex me-1"></i>正则匹配Origin
                                    </label>
                                    <textarea class="form-control" rows="3" id="cors-origins-regex" 
                                              placeholder='[".*.example.com"]'>${plugin.config.allow_origins_by_regex?JSON.stringify(plugin.config.allow_origins_by_regex, null, 2):''}</textarea>
                                    <small class="form-text text-muted">JSON数组格式的正则表达式</small>
                        </div>
                            </div>
                            </div>
                        </div>

                    <!-- 请求配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-http me-2"></i>请求配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-bulleted me-1"></i>允许的方法
                                    </label>
                                    <input type="text" class="form-control" id="cors-methods" 
                                           value="${plugin.config.allow_methods||'GET,POST,PUT,DELETE,OPTIONS'}" 
                                           placeholder="GET,POST,PUT,DELETE,OPTIONS">
                                    <small class="form-text text-muted">逗号分隔的HTTP方法列表</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>允许的请求头
                                    </label>
                                    <input type="text" class="form-control" id="cors-headers" 
                                           value="${plugin.config.allow_headers||'*'}" 
                                           placeholder="Content-Type,Authorization,*">
                                    <small class="form-text text-muted">逗号分隔的请求头列表，*表示允许所有</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 响应配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-reply me-2"></i>响应配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-eye me-1"></i>暴露的响应头
                                    </label>
                                    <input type="text" class="form-control" id="cors-expose" 
                                           value="${plugin.config.expose_headers||''}" 
                                           placeholder="X-Total-Count,X-Page-Count">
                                    <small class="form-text text-muted">逗号分隔的响应头列表</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>缓存时间
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="cors-maxage" 
                                               value="${plugin.config.max_age??0}" 
                                               min="0" max="86400">
                                        <span class="input-group-text">秒</span>
                                    </div>
                                    <small class="form-text text-muted">预检请求的缓存时间</small>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="cors-cred" 
                                               ${plugin.config.allow_credentials?'checked':''}>
                                        <label class="form-check-label fw-bold" for="cors-cred">
                                            <i class="mdi mdi-cookie me-1"></i>允许携带凭证
                                        </label>
                                        <small class="form-text text-muted d-block">允许发送Cookie和认证信息</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                `);
            case 'uri-blocker':
                return wrap(`
                    <!-- 拦截规则配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-block-helper me-2"></i>拦截规则配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>拦截规则
                                </label>
                                <textarea class="form-control" rows="4" id="ub-rules" 
                                          placeholder="/admin/*&#10;/api/private/*&#10;/internal/.*">${(plugin.config.block_rules||[]).join('\n')}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    每行一条规则，支持正则表达式
                                </small>
                        </div>
                        </div>
                            </div>

                    <!-- 拦截行为配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>拦截行为配置
                            </h6>
                                </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                    </label>
                                    <input type="number" class="form-control" id="ub-code" 
                                           value="${plugin.config.reject_code??403}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">拦截时返回的HTTP状态码</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ub-case" 
                                               ${plugin.config.case_insensitive?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ub-case">
                                            <i class="mdi mdi-format-letter-case me-1"></i>大小写不敏感
                                        </label>
                                        <small class="form-text text-muted d-block">匹配时忽略大小写</small>
                        </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'ip-restriction':
                return wrap(`
                    <!-- IP列表配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-ip-network me-2"></i>IP列表配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>IP白名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ip-whitelist" 
                                              placeholder="192.168.1.0/24&#10;10.0.0.1&#10;172.16.0.0/16">${(plugin.config.whitelist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个IP或CIDR，支持网段
                                    </small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-close-circle me-1"></i>IP黑名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ip-blacklist" 
                                              placeholder="203.0.113.0/24&#10;198.51.100.1&#10;192.0.2.0/24">${(plugin.config.blacklist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个IP或CIDR，支持网段
                                    </small>
                            </div>
                            </div>
                        </div>
                        </div>

                    <!-- 拦截行为配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>拦截行为配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                </label>
                                <input type="number" class="form-control" id="ip-code" 
                                       value="${plugin.config.rejected_code??403}" 
                                       min="100" max="599">
                                <small class="form-text text-muted">IP被拒绝时返回的HTTP状态码</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'ua-restriction':
                return wrap(`
                    <!-- User-Agent列表配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account me-2"></i>User-Agent列表配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>UA白名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ua-whitelist" 
                                              placeholder="Mozilla/5.0.*Chrome.*&#10;Mozilla/5.0.*Firefox.*&#10;.*Safari.*">${(plugin.config.whitelist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个UA模式，支持正则表达式
                                    </small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-close-circle me-1"></i>UA黑名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ua-blacklist" 
                                              placeholder=".*bot.*&#10;.*crawler.*&#10;.*spider.*">${(plugin.config.blacklist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个UA模式，支持正则表达式
                                    </small>
                            </div>
                            </div>
                        </div>
                        </div>

                    <!-- 拦截行为配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>拦截行为配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                </label>
                                <input type="number" class="form-control" id="ua-code" 
                                       value="${plugin.config.rejected_code??403}" 
                                       min="100" max="599">
                                <small class="form-text text-muted">UA被拒绝时返回的HTTP状态码</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'referer-restriction':
                return wrap(`
                    <!-- Referer列表配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-link me-2"></i>Referer列表配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>Referer白名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ref-whitelist" 
                                              placeholder="https://example.com/*&#10;https://trusted-site.com/*&#10;.*\\.example\\.com.*">${(plugin.config.whitelist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个Referer模式，支持正则表达式
                                    </small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-close-circle me-1"></i>Referer黑名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="ref-blacklist" 
                                              placeholder="https://malicious-site.com/*&#10;.*\\.spam\\.com.*&#10;https://blocked-domain.com/*">${(plugin.config.blacklist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个Referer模式，支持正则表达式
                                    </small>
                            </div>
                            </div>
                        </div>
                            </div>

                    <!-- 拦截行为配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>拦截行为配置
                            </h6>
                                </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                    </label>
                                    <input type="number" class="form-control" id="ref-code" 
                                           value="${plugin.config.rejected_code??403}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">Referer被拒绝时返回的HTTP状态码</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="ref-allow-empty" 
                                               ${plugin.config.allow_empty?'checked':''}>
                                        <label class="form-check-label fw-bold" for="ref-allow-empty">
                                            <i class="mdi mdi-link-off me-1"></i>允许空Referer
                                        </label>
                                        <small class="form-text text-muted d-block">允许没有Referer头的请求</small>
                        </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'consumer-restriction':
                return wrap(`
                    <!-- 消费者列表配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-account-group me-2"></i>消费者列表配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>消费者白名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="cr-whitelist" 
                                              placeholder="user1&#10;user2&#10;admin&#10;*">${(plugin.config.whitelist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个消费者名称，*表示允许所有
                                    </small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-close-circle me-1"></i>消费者黑名单
                                    </label>
                                    <textarea class="form-control" rows="4" id="cr-blacklist" 
                                              placeholder="blocked_user1&#10;blocked_user2&#10;suspended_user">${(plugin.config.blacklist||[]).join('\n')}</textarea>
                                    <small class="form-text text-muted">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        每行一个消费者名称，可选配置
                                    </small>
                            </div>
                            </div>
                        </div>
                    </div>

                    <!-- 执行配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>执行配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                            <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="cr-preflight" 
                                           ${plugin.config.run_on_preflight?'checked':''}>
                                    <label class="form-check-label fw-bold" for="cr-preflight">
                                        <i class="mdi mdi-arrow-decision me-1"></i>预检请求也执行限制
                                    </label>
                                    <small class="form-text text-muted d-block">对OPTIONS预检请求也应用消费者限制</small>
                            </div>
                        </div>
                        </div>
                    </div>
                `);
            case 'csrf':
                return wrap(`
                    <!-- Token配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-key me-2"></i>Token配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>Header名称
                                    </label>
                                    <input type="text" class="form-control" id="csrf-header" 
                                           value="${plugin.config.header_name||'X-CSRF-TOKEN'}" 
                                           placeholder="X-CSRF-TOKEN">
                                    <small class="form-text text-muted">CSRF Token的HTTP头名称</small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cookie me-1"></i>Cookie名称
                                    </label>
                                    <input type="text" class="form-control" id="csrf-cookie" 
                                           value="${plugin.config.cookie_name||'csrf_token'}" 
                                           placeholder="csrf_token">
                                    <small class="form-text text-muted">CSRF Token的Cookie名称</small>
                            </div>
                            </div>
                        </div>
                            </div>

                    <!-- 安全配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>安全配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>有效期
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="csrf-expires" 
                                               value="${plugin.config.expires??7200}" 
                                               min="60" max="86400">
                                        <span class="input-group-text">秒</span>
                                    </div>
                                    <small class="form-text text-muted">Token的有效期</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cookie-settings me-1"></i>SameSite
                                    </label>
                                <select class="form-select" id="csrf-samesite">
                                    <option ${plugin.config.same_site==='Lax'?'selected':''} value="Lax">Lax</option>
                                    <option ${plugin.config.same_site==='Strict'?'selected':''} value="Strict">Strict</option>
                                    <option ${plugin.config.same_site==='None'?'selected':''} value="None">None</option>
                                </select>
                                    <small class="form-text text-muted">Cookie的SameSite属性</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="csrf-secure" 
                                               ${plugin.config.secure?'checked':''}>
                                        <label class="form-check-label fw-bold" for="csrf-secure">
                                            <i class="mdi mdi-lock me-1"></i>仅HTTPS
                                        </label>
                                        <small class="form-text text-muted d-block">仅在HTTPS下发送Cookie</small>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                `);
            case 'public-api':
                return wrap(`
                    <!-- 公开API配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-earth me-2"></i>公开API配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>公开的URI列表
                                </label>
                                <textarea class="form-control" rows="4" id="public-uris" 
                                          placeholder='["/status","/metrics","/health","/version"]'>${plugin.config.uri?JSON.stringify(plugin.config.uri, null, 2):''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    JSON数组格式，这些URI将允许公开访问
                                </small>
                        </div>
                        </div>
                    </div>
                `);
            case 'GM':
                return wrap(`
                    <!-- 国密算法配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-lock me-2"></i>国密算法配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cog me-1"></i>算法/模式
                                    </label>
                                <select class="form-select" id="gm-mode">
                                        <option ${plugin.config.mode==='SM2'?'selected':''} value="SM2">SM2 (椭圆曲线公钥密码)</option>
                                        <option ${plugin.config.mode==='SM3'?'selected':''} value="SM3">SM3 (哈希算法)</option>
                                        <option ${plugin.config.mode==='SM4'?'selected':''} value="SM4">SM4 (分组密码)</option>
                                </select>
                                    <small class="form-text text-muted">选择国密算法类型</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="gm-tls13" 
                                               ${plugin.config.tls13_only?'checked':''}>
                                        <label class="form-check-label fw-bold" for="gm-tls13">
                                            <i class="mdi mdi-lock me-1"></i>仅TLS1.3
                                        </label>
                                        <small class="form-text text-muted d-block">仅支持TLS1.3协议</small>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 证书配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-certificate me-2"></i>证书配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-file-document me-1"></i>证书/密钥(PEM)
                                </label>
                                <textarea class="form-control" rows="4" id="gm-cert" 
                                          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----">${plugin.config.cert||''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    PEM格式的国密证书或密钥
                                </small>
                            </div>
                        </div>
                    </div>
                `);
            case 'chaitin-waf':
                return wrap(`
                    <!-- WAF连接配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-alert me-2"></i>WAF连接配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-link me-1"></i>WAF接入地址
                                </label>
                                <input type="text" class="form-control" id="cw-endpoint" 
                                       value="${plugin.config.endpoint||''}" 
                                       placeholder="https://waf.chaitin.com/api/v1">
                                <small class="form-text text-muted">长亭WAF服务的API接入地址</small>
                        </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key me-1"></i>Access Key
                                    </label>
                                    <input type="text" class="form-control" id="cw-ak" 
                                           value="${plugin.config.access_key||''}" 
                                           placeholder="your-access-key">
                                    <small class="form-text text-muted">WAF服务的访问密钥</small>
                        </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-key-variant me-1"></i>Secret Key
                                    </label>
                                    <div class="input-group">
                                        <input type="password" class="form-control" id="cw-sk" 
                                               value="${plugin.config.secret_key||''}" 
                                               placeholder="your-secret-key">
                                        <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('cw-sk')">
                                            <i class="mdi mdi-eye"></i>
                                        </button>
                            </div>
                                    <small class="form-text text-muted">WAF服务的秘密密钥</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- WAF行为配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>WAF行为配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-shield-check me-1"></i>工作模式
                                    </label>
                                <select class="form-select" id="cw-mode">
                                        <option ${plugin.config.mode==='detect'?'selected':''} value="detect">检测模式</option>
                                        <option ${plugin.config.mode==='block'?'selected':''} value="block">拦截模式</option>
                                </select>
                                    <small class="form-text text-muted">WAF的工作模式</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>拦截状态码
                                    </label>
                                    <input type="number" class="form-control" id="cw-code" 
                                           value="${plugin.config.block_code??403}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">拦截时返回的HTTP状态码</small>
                            </div>
                        </div>
                        </div>
                    </div>
                `);
            // ================= 流量控制插件 =================
            case 'limit-req':
                return wrap(`
                    <!-- 限流配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-speedometer me-2"></i>限流配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>速率
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="lr-rate" 
                                               value="${plugin.config.rate??10}" 
                                               min="1" max="10000">
                                        <span class="input-group-text">次/秒</span>
                        </div>
                                    <small class="form-text text-muted">每秒允许的请求数</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-flash me-1"></i>突发
                                    </label>
                                    <input type="number" class="form-control" id="lr-burst" 
                                           value="${plugin.config.burst??0}" 
                                           min="0" max="1000">
                                    <small class="form-text text-muted">允许的突发请求数</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="lr-nodelay" 
                                               ${plugin.config.nodelay?'checked':''}>
                                        <label class="form-check-label fw-bold" for="lr-nodelay">
                                            <i class="mdi mdi-close-circle me-1"></i>不延迟
                                        </label>
                                        <small class="form-text text-muted d-block">直接拒绝超额请求</small>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 限流键配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>限流键配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-bulleted me-1"></i>限流键类型
                                    </label>
                                <select class="form-select" id="lr-key-type">
                                        <option ${plugin.config.key_type==='remote_addr'?'selected':''} value="remote_addr">remote_addr (客户端IP)</option>
                                        <option ${plugin.config.key_type==='consumer_name'?'selected':''} value="consumer_name">consumer_name (消费者名称)</option>
                                        <option ${plugin.config.key_type==='header'?'selected':''} value="header">header (请求头)</option>
                                        <option ${plugin.config.key_type==='query'?'selected':''} value="query">query (查询参数)</option>
                                </select>
                                    <small class="form-text text-muted">限流键的识别方式</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>键名称
                                    </label>
                                    <input type="text" class="form-control" id="lr-key-name" 
                                           value="${plugin.config.key||''}" 
                                           placeholder="当类型为header/query时填写">
                                    <small class="form-text text-muted">header名称或query参数名</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 拒绝配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-alert-circle me-2"></i>拒绝配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                </label>
                                <input type="number" class="form-control" id="lr-code" 
                                       value="${plugin.config.rejected_code??429}" 
                                       min="100" max="599">
                                <small class="form-text text-muted">限流时返回的HTTP状态码</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'limit-conn':
                return wrap(`
                    <!-- 并发限制配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-connection me-2"></i>并发限制配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-account-multiple me-1"></i>并发数
                                    </label>
                                    <input type="number" class="form-control" id="lc-conn" 
                                           value="${plugin.config.conn??100}" 
                                           min="1" max="10000">
                                    <small class="form-text text-muted">允许的最大并发连接数</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-flash me-1"></i>突发
                                    </label>
                                    <input type="number" class="form-control" id="lc-burst" 
                                           value="${plugin.config.burst??0}" 
                                           min="0" max="1000">
                                    <small class="form-text text-muted">允许的突发连接数</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>默认延迟
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="lc-delay" 
                                               value="${plugin.config.default_conn_delay??0}" 
                                               min="0" max="60000">
                                        <span class="input-group-text">毫秒</span>
                                    </div>
                                    <small class="form-text text-muted">连接延迟时间</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 限流键配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>限流键配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-bulleted me-1"></i>限流键类型
                                    </label>
                                    <select class="form-select" id="lc-key-type">
                                        <option ${plugin.config.key_type==='remote_addr'?'selected':''} value="remote_addr">remote_addr (客户端IP)</option>
                                        <option ${plugin.config.key_type==='consumer_name'?'selected':''} value="consumer_name">consumer_name (消费者名称)</option>
                                        <option ${plugin.config.key_type==='header'?'selected':''} value="header">header (请求头)</option>
                                        <option ${plugin.config.key_type==='query'?'selected':''} value="query">query (查询参数)</option>
                                    </select>
                                    <small class="form-text text-muted">限流键的识别方式</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>键名称
                                    </label>
                                    <input type="text" class="form-control" id="lc-key-name" 
                                           value="${plugin.config.key||''}" 
                                           placeholder="当类型为header/query时填写">
                                    <small class="form-text text-muted">header名称或query参数名</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 拒绝配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-alert-circle me-2"></i>拒绝配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-numeric me-1"></i>拒绝状态码
                                </label>
                                <input type="number" class="form-control" id="lc-code" 
                                       value="${plugin.config.rejected_code??503}" 
                                       min="100" max="599">
                                <small class="form-text text-muted">并发超限时返回的HTTP状态码</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'limit-count':
                return wrap(`
                    <!-- 计数限流配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-counter me-2"></i>计数限流配置
                            </h6>
                            </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>次数
                                    </label>
                                    <input type="number" class="form-control" id="lcnt-count" 
                                           value="${plugin.config.count??100}" 
                                           min="1" max="100000">
                                    <small class="form-text text-muted">时间窗内允许的请求次数</small>
                        </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>时间窗
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="lcnt-window" 
                                               value="${plugin.config.time_window??60}" 
                                               min="1" max="86400">
                                        <span class="input-group-text">秒</span>
                            </div>
                                    <small class="form-text text-muted">限流统计的时间窗口</small>
                            </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-alert-circle me-1"></i>拒绝状态码
                                    </label>
                                    <input type="number" class="form-control" id="lcnt-code" 
                                           value="${plugin.config.rejected_code??429}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">超限时返回的HTTP状态码</small>
                            </div>
                        </div>
                        </div>
                    </div>

                    <!-- 限流键配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>限流键配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-bulleted me-1"></i>限流键类型
                                    </label>
                                <select class="form-select" id="lcnt-key-type">
                                        <option ${plugin.config.key_type==='remote_addr'?'selected':''} value="remote_addr">remote_addr (客户端IP)</option>
                                        <option ${plugin.config.key_type==='consumer_name'?'selected':''} value="consumer_name">consumer_name (消费者名称)</option>
                                        <option ${plugin.config.key_type==='header'?'selected':''} value="header">header (请求头)</option>
                                        <option ${plugin.config.key_type==='query'?'selected':''} value="query">query (查询参数)</option>
                                </select>
                                    <small class="form-text text-muted">限流键的识别方式</small>
                            </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>键名称
                                    </label>
                                    <input type="text" class="form-control" id="lcnt-key-name" 
                                           value="${plugin.config.key||''}" 
                                           placeholder="当类型为header/query时填写">
                                    <small class="form-text text-muted">header名称或query参数名</small>
                            </div>
                        </div>
                        </div>
                    </div>
                `);
            case 'proxy-cache':
                return wrap(`
                    <!-- 缓存基础配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cached me-2"></i>缓存基础配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-database me-1"></i>缓存区域
                                    </label>
                                    <input type="text" class="form-control" id="pc-zone" 
                                           value="${plugin.config.cache_zone||'disk_cache_one'}" 
                                           placeholder="disk_cache_one">
                                    <small class="form-text text-muted">缓存存储区域名称</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-clock-outline me-1"></i>缓存TTL
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="pc-ttl" 
                                               value="${plugin.config.cache_ttl??300}" 
                                               min="1" max="86400">
                                        <span class="input-group-text">秒</span>
                                    </div>
                                    <small class="form-text text-muted">缓存生存时间</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 缓存键配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-key me-2"></i>缓存键配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>缓存键
                                </label>
                                <textarea class="form-control" rows="3" id="pc-keys" 
                                          placeholder='["$host","$request_uri","$args"]'>${plugin.config.cache_key?JSON.stringify(plugin.config.cache_key, null, 2):''}</textarea>
                                <small class="form-text text-muted">
                                    <i class="mdi mdi-information-outline me-1"></i>
                                    JSON数组格式，用于生成缓存键的变量列表
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- 缓存策略配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>缓存策略配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>缓存状态码
                                    </label>
                                    <textarea class="form-control" rows="3" id="pc-statuses" 
                                              placeholder='[200,201,301,302]'>${plugin.config.cache_http_status?JSON.stringify(plugin.config.cache_http_status, null, 2):''}</textarea>
                                    <small class="form-text text-muted">允许缓存的HTTP状态码</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="pc-hide" 
                                               ${plugin.config.hide_cache_headers?'checked':''}>
                                        <label class="form-check-label fw-bold" for="pc-hide">
                                            <i class="mdi mdi-eye-off me-1"></i>隐藏缓存头
                                        </label>
                                        <small class="form-text text-muted d-block">隐藏缓存相关的响应头</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 缓存排除配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-close-circle me-2"></i>缓存排除配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-arrow-right me-1"></i>绕过缓存
                                    </label>
                                    <textarea class="form-control" rows="3" id="pc-bypass" 
                                              placeholder='["$arg_nocache","$http_cache_control"]'>${plugin.config.cache_bypass?JSON.stringify(plugin.config.cache_bypass, null, 2):''}</textarea>
                                    <small class="form-text text-muted">绕过缓存的变量条件</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-block-helper me-1"></i>不缓存
                                    </label>
                                    <textarea class="form-control" rows="3" id="pc-nocache" 
                                              placeholder='["$http_pragma","$http_authorization"]'>${plugin.config.no_cache?JSON.stringify(plugin.config.no_cache, null, 2):''}</textarea>
                                    <small class="form-text text-muted">不进行缓存的变量条件</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'request-validation':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">请求校验（request-validation）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">Header JSON Schema</label>\n                                <textarea class=\"form-control\" rows=\"4\" id=\"rv-header\">${plugin.config.header_schema?JSON.stringify(plugin.config.header_schema, null, 2):''}</textarea>\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">Query JSON Schema</label>\n                                <textarea class=\"form-control\" rows=\"4\" id=\"rv-query\">${plugin.config.query_schema?JSON.stringify(plugin.config.query_schema, null, 2):''}</textarea>\n                            </div>\n                        </div>\n                        <div class=\"form-group\">\n                            <label class=\"form-label\">Body JSON Schema</label>\n                            <textarea class=\"form-control\" rows=\"5\" id=\"rv-body\">${plugin.config.body_schema?JSON.stringify(plugin.config.body_schema, null, 2):''}</textarea>\n                        </div>\n                        <div class=\"form-group col-md-4 p-0\">\n                            <label class=\"form-label\">拒绝状态码</label>\n                            <input type=\"number\" class=\"form-control\" id=\"rv-code\" value=\"${plugin.config.rejected_code??400}\">\n                        </div>\n                    </form>`;
            case 'proxy-mirror':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">请求镜像（proxy-mirror）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-group\">\n                            <label class=\"form-label\">镜像主机</label>\n                            <input type=\"text\" class=\"form-control\" id=\"pm-host\" value=\"${plugin.config.host||''}\" placeholder=\"http://mirror:8080\">\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">镜像路径</label>\n                                <input type=\"text\" class=\"form-control\" id=\"pm-path\" value=\"${plugin.config.path||''}\" placeholder=\"/mirror\">\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">采样比例(0-1)</label>\n                                <input type=\"number\" step=\"0.01\" class=\"form-control\" id=\"pm-sample\" value=\"${plugin.config.sample_ratio??1}\">\n                            </div>\n                        </div>\n                    </form>`;
            case 'api-breaker':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">熔断（api-breaker）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">非健康状态码(JSON 数组)</label>\n                                <textarea class=\"form-control\" rows=\"3\" id=\"ab-unhealthy\" placeholder='[500,502,503]'>${plugin.config.unhealthy?.http_statuses?JSON.stringify(plugin.config.unhealthy.http_statuses, null, 2):''}</textarea>\n                                <small class=\"form-text\">触发阈值</small>\n                                <input type=\"number\" class=\"form-control\" id=\"ab-unhealthy-fail\" value=\"${plugin.config.unhealthy?.failures??3}\">\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">健康状态码(JSON 数组)</label>\n                                <textarea class=\"form-control\" rows=\"3\" id=\"ab-healthy\" placeholder='[200,201,204]'>${plugin.config.healthy?.http_statuses?JSON.stringify(plugin.config.healthy.http_statuses, null, 2):''}</textarea>\n                                <small class=\"form-text\">恢复阈值</small>\n                                <input type=\"number\" class=\"form-control\" id=\"ab-healthy-succ\" value=\"${plugin.config.healthy?.successes??3}\">\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">熔断返回码</label>\n                                <input type=\"number\" class=\"form-control\" id=\"ab-code\" value=\"${plugin.config.break_response_code??502}\">\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">最大熔断时长(秒)</label>\n                                <input type=\"number\" class=\"form-control\" id=\"ab-duration\" value=\"${plugin.config.max_breaker_sec??30}\">\n                            </div>\n                        </div>\n                    </form>`;
            case 'traffic-split':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">流量划分（traffic-split）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-group\">\n                            <label class=\"form-label\">规则(JSON 数组)</label>\n                            <textarea class=\"form-control\" rows=\"5\" id=\"ts-rules\" placeholder='[{"weighted_upstreams":[{"upstream_id":"u1","weight":80},{"upstream_id":"u2","weight":20}],"match":[{"vars":[["http_user","==","A"]]}]}]'>${plugin.config.rules?JSON.stringify(plugin.config.rules, null, 2):''}</textarea>\n                        </div>\n                    </form>`;
            case 'request-id':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">请求ID（request-id）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">Header 名称</label>\n                                <input type=\"text\" class=\"form-control\" id=\"rid-header\" value=\"${plugin.config.header_name||'X-Request-Id'}\">\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">算法</label>\n                                <select class=\"form-select\" id=\"rid-alg\">\n                                    <option ${plugin.config.generator==='uuid'?'selected':''} value=\"uuid\">UUID</option>\n                                    <option ${plugin.config.generator==='nanoid'?'selected':''} value=\"nanoid\">NanoID</option>\n                                    <option ${plugin.config.generator==='snowflake'?'selected':''} value=\"snowflake\">Snowflake</option>\n                                </select>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">前缀</label>\n                                <input type=\"text\" class=\"form-control\" id=\"rid-prefix\" value=\"${plugin.config.include_prefix||''}\">\n                            </div>\n                            <div class=\"form-group col-md-6 d-flex align-items-end\">\n                                <div class=\"form-check form-switch mt-2\">\n                                    <input class=\"form-check-input\" type=\"checkbox\" id=\"rid-resp\" ${plugin.config.include_in_response?'checked':''}>\n                                    <label class=\"form-check-label\" for=\"rid-resp\">写回响应头</label>\n                                </div>\n                            </div>\n                        </div>\n                    </form>`;
            case 'proxy-control':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">代理控制（proxy-control）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-4\">\n                                <label class=\"form-label\">请求缓冲</label>\n                                <div class=\"form-check form-switch mt-2\">\n                                    <input class=\"form-check-input\" type=\"checkbox\" id=\"pctl-req-buf\" ${plugin.config.request_buffering?'checked':''}>\n                                    <label class=\"form-check-label\" for=\"pctl-req-buf\">启用</label>\n                                </div>\n                            </div>\n                            <div class=\"form-group col-md-4\">\n                                <label class=\"form-label\">响应缓冲</label>\n                                <div class=\"form-check form-switch mt-2\">\n                                    <input class=\"form-check-input\" type=\"checkbox\" id=\"pctl-resp-buf\" ${plugin.config.response_buffering?'checked':''}>\n                                    <label class=\"form-check-label\" for=\"pctl-resp-buf\">启用</label>\n                                </div>\n                            </div>\n                            <div class=\"form-group col-md-4\">\n                                <label class=\"form-label\">HTTP 版本</label>\n                                <select class=\"form-select\" id=\"pctl-http\">\n                                    <option ${plugin.config.http_version==='1.1'?'selected':''} value=\"1.1\">1.1</option>\n                                    <option ${plugin.config.http_version==='2'?'selected':''} value=\"2\">2</option>\n                                </select>\n                            </div>\n                        </div>\n                    </form>`;
            case 'client-control':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">客户端控制（client-control）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-row\">\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">最大包体(字节)</label>\n                                <input type=\"number\" class=\"form-control\" id=\"cc-max\" value=\"${plugin.config.max_body_size??10485760}\">\n                            </div>\n                            <div class=\"form-group col-md-6\">\n                                <label class=\"form-label\">拒绝状态码</label>\n                                <input type=\"number\" class=\"form-control\" id=\"cc-code\" value=\"${plugin.config.rejected_code??413}\">\n                            </div>\n                        </div>\n                    </form>`;
            case 'workflow':
                return `
                    <form id=\"plugin02-form\">\n                        <div class=\"form-group d-flex justify-content-between align-items-center\">\n                            <label class=\"form-label mb-0\">工作流（workflow）</label>\n                            <div class=\"form-check form-switch\">\n                                <input class=\"form-check-input\" type=\"checkbox\" id=\"plugin02-enabled\" ${plugin.enabled ? 'checked' : ''}>\n                            </div>\n                        </div>\n                        <div class=\"form-group\">\n                            <label class=\"form-label\">规则(JSON)</label>\n                            <textarea class=\"form-control\" rows=\"5\" id=\"wf-rules\" placeholder='{"flow":[{"if":["==",["var","uri"],"/a"],"then":[{"plugin":"proxy-rewrite","conf":{}}]}]}' >${plugin.config.rules?JSON.stringify(plugin.config.rules, null, 2):''}</textarea>\n                        </div>\n                        <div class=\"form-group col-md-4 p-0\">\n                            <label class=\"form-label\">超时(毫秒)</label>\n                            <input type=\"number\" class=\"form-control\" id=\"wf-timeout\" value=\"${plugin.config.timeout_ms??0}\">\n                        </div>\n                    </form>`;
            // ================= 转换插件 =================
            case 'response-rewrite':
                return wrap(`
                    <!-- 响应状态配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-numeric me-2"></i>响应状态配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-check-circle me-1"></i>状态码
                                    </label>
                                    <input type="number" class="form-control" id="rr-status" 
                                           value="${plugin.config.status_code??200}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">HTTP响应状态码</small>
                                </div>
                                <div class="col-md-6 mb-3">
                            <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="rr-base64" 
                                               ${plugin.config.body_base64?'checked':''}>
                                        <label class="form-check-label fw-bold" for="rr-base64">
                                            <i class="mdi mdi-code-braces me-1"></i>Base64编码
                                        </label>
                                        <small class="form-text text-muted d-block">响应体是否为Base64编码</small>
                            </div>
                        </div>
                            </div>
                                </div>
                            </div>

                    <!-- 响应头配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-header-pound me-2"></i>响应头配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-tag me-1"></i>响应头
                                </label>
                                <textarea class="form-control" rows="4" id="rr-headers" 
                                          placeholder='{"X-Custom-Header": "value"}'>${plugin.config.headers?JSON.stringify(plugin.config.headers, null, 2):''}</textarea>
                                <small class="form-text text-muted">要添加或修改的响应头</small>
                        </div>
                        </div>
                    </div>

                    <!-- 响应体配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-message-text me-2"></i>响应体配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-content me-1"></i>响应体
                                </label>
                                <textarea class="form-control" rows="5" id="rr-body" 
                                          placeholder="自定义响应体内容">${plugin.config.body||''}</textarea>
                                <small class="form-text text-muted">自定义响应体内容</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'proxy-rewrite':
                return wrap(`
                    <!-- 代理配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-server me-2"></i>代理配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-http me-1"></i>协议
                                    </label>
                                    <select class="form-select" id="pr-scheme">
                                        <option ${plugin.config.scheme==='http'?'selected':''} value="http">HTTP</option>
                                        <option ${plugin.config.scheme==='https'?'selected':''} value="https">HTTPS</option>
                                    </select>
                                    <small class="form-text text-muted">代理请求的协议类型</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>Host
                                    </label>
                                    <input type="text" class="form-control" id="pr-host" 
                                           value="${plugin.config.host||''}" 
                                           placeholder="api.example.com">
                                    <small class="form-text text-muted">代理请求的目标主机</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-link me-1"></i>URI
                                    </label>
                                    <input type="text" class="form-control" id="pr-uri" 
                                           value="${plugin.config.uri||''}" 
                                           placeholder="/api/v1">
                                    <small class="form-text text-muted">代理请求的URI路径</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 重写配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-content-cut me-2"></i>重写配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-regex me-1"></i>正则URI重写
                                    </label>
                                    <textarea class="form-control" rows="4" id="pr-regex" 
                                              placeholder='["^/old/(.*)","/new/$1"]'>${plugin.config.regex_uri?JSON.stringify(plugin.config.regex_uri, null, 2):''}</textarea>
                                    <small class="form-text text-muted">URI正则表达式重写规则</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-header-pound me-1"></i>请求头重写
                                    </label>
                                    <textarea class="form-control" rows="4" id="pr-headers" 
                                              placeholder='{"X-Custom-Header": "value"}'>${plugin.config.headers?JSON.stringify(plugin.config.headers, null, 2):''}</textarea>
                                    <small class="form-text text-muted">要添加或修改的请求头</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'grpc-transcode':
                return wrap(`
                    <!-- gRPC服务配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-server me-2"></i>gRPC服务配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-file-document me-1"></i>Proto ID
                                    </label>
                                    <input type="text" class="form-control" id="gt-proto-id" 
                                           value="${plugin.config.proto_id||''}" 
                                           placeholder="1">
                                    <small class="form-text text-muted">Protocol Buffer定义的ID</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-cog me-1"></i>服务名称
                                    </label>
                                    <input type="text" class="form-control" id="gt-service" 
                                           value="${plugin.config.service||''}" 
                                           placeholder="helloworld.Greeter">
                                    <small class="form-text text-muted">gRPC服务名称</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-function me-1"></i>方法名称
                                    </label>
                                    <input type="text" class="form-control" id="gt-method" 
                                           value="${plugin.config.method||''}" 
                                           placeholder="SayHello">
                                    <small class="form-text text-muted">gRPC方法名称</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 超时配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-clock-outline me-2"></i>超时配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>请求超时
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="gt-deadline" 
                                               value="${plugin.config.deadline??0}" 
                                               min="0" max="3600">
                                        <span class="input-group-text">秒</span>
                                    </div>
                                    <small class="form-text text-muted">gRPC请求的超时时间</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'grpc-web':
                return wrap(`
                    <!-- CORS配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-earth me-2"></i>CORS配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-domain me-1"></i>允许来源
                                    </label>
                                    <input type="text" class="form-control" id="gw-origin" 
                                           value="${plugin.config.allow_origin||'*'}" 
                                           placeholder="*">
                                    <small class="form-text text-muted">允许的跨域来源</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="gw-cred" 
                                               ${plugin.config.allow_credentials?'checked':''}>
                                        <label class="form-check-label fw-bold" for="gw-cred">
                                            <i class="mdi mdi-cookie me-1"></i>允许凭证
                                        </label>
                                        <small class="form-text text-muted d-block">允许发送Cookie和认证头</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'fault-injection':
                return wrap(`
                    <!-- 中断配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-alert-circle me-2"></i>中断配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>中断状态码
                                    </label>
                                    <input type="number" class="form-control" id="fi-abort" 
                                           value="${plugin.config.abort?.http_status??0}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">故障注入时的HTTP状态码</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-percent me-1"></i>影响比例
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="fi-percent" 
                                               value="${plugin.config.percentage??0}" 
                                               min="0" max="100">
                                        <span class="input-group-text">%</span>
                                    </div>
                                    <small class="form-text text-muted">故障注入的影响比例</small>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-message-text me-1"></i>中断响应体
                                </label>
                                <textarea class="form-control" rows="3" id="fi-body" 
                                          placeholder="故障注入时的响应体">${plugin.config.abort?.body||''}</textarea>
                                <small class="form-text text-muted">故障注入时返回的响应体内容</small>
                            </div>
                        </div>
                    </div>

                    <!-- 延迟配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-clock-outline me-2"></i>延迟配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>延迟时间
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="fi-delay" 
                                               value="${plugin.config.delay?.fixed_delay_ms??0}" 
                                               min="0" max="60000">
                                        <span class="input-group-text">毫秒</span>
                                    </div>
                                    <small class="form-text text-muted">故障注入时的延迟时间</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'mocking':
                return wrap(`
                    <!-- Mock响应配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-test-tube me-2"></i>Mock响应配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-numeric me-1"></i>状态码
                                    </label>
                                    <input type="number" class="form-control" id="mk-status" 
                                           value="${plugin.config.status_code??200}" 
                                           min="100" max="599">
                                    <small class="form-text text-muted">Mock响应的HTTP状态码</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-timer me-1"></i>延迟时间
                                    </label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="mk-delay" 
                                               value="${plugin.config.delay_ms??0}" 
                                               min="0" max="60000">
                                        <span class="input-group-text">毫秒</span>
                                    </div>
                                    <small class="form-text text-muted">Mock响应的延迟时间</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 响应头配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-header-pound me-2"></i>响应头配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-tag me-1"></i>响应头
                                </label>
                                <textarea class="form-control" rows="4" id="mk-headers" 
                                          placeholder='{"Content-Type": "application/json"}'>${plugin.config.headers?JSON.stringify(plugin.config.headers, null, 2):''}</textarea>
                                <small class="form-text text-muted">Mock响应的HTTP头</small>
                            </div>
                        </div>
                    </div>

                    <!-- 响应体配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-message-text me-2"></i>响应体配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-content me-1"></i>响应体
                                </label>
                                <textarea class="form-control" rows="5" id="mk-body" 
                                          placeholder="Mock响应的内容">${plugin.config.body||''}</textarea>
                                <small class="form-text text-muted">Mock响应的内容</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'degraphql':
                return wrap(`
                    <!-- GraphQL Schema配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-graphql me-2"></i>GraphQL Schema配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-file-document me-1"></i>SDL Schema
                                </label>
                                <textarea class="form-control" rows="6" id="dg-sdl" 
                                          placeholder="type Query { ... }">${plugin.config.sdl||''}</textarea>
                                <small class="form-text text-muted">GraphQL Schema定义语言</small>
                            </div>
                        </div>
                    </div>

                    <!-- 限制配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-shield-check me-2"></i>限制配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-arrow-collapse-down me-1"></i>最大深度
                                    </label>
                                    <input type="number" class="form-control" id="dg-depth" 
                                           value="${plugin.config.max_depth??0}" 
                                           min="0" max="100">
                                    <small class="form-text text-muted">查询的最大嵌套深度</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-calculator me-1"></i>最大代价
                                    </label>
                                    <input type="number" class="form-control" id="dg-cost" 
                                           value="${plugin.config.max_cost??0}" 
                                           min="0" max="10000">
                                    <small class="form-text text-muted">查询的最大计算代价</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'webassembly':
                return wrap(`
                    <!-- WebAssembly模块配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-language-c me-2"></i>WebAssembly模块配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-file-code me-1"></i>模块路径/URL
                                    </label>
                                    <input type="text" class="form-control" id="wa-module" 
                                           value="${plugin.config.module||''}" 
                                           placeholder="/path/to/module.wasm">
                                    <small class="form-text text-muted">WebAssembly模块文件路径或URL</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-function me-1"></i>入口函数
                                    </label>
                                    <input type="text" class="form-control" id="wa-func" 
                                           value="${plugin.config.function||''}" 
                                           placeholder="main">
                                    <small class="form-text text-muted">WebAssembly模块的入口函数名</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 扩展配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-cog me-2"></i>扩展配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-code-json me-1"></i>扩展配置
                                </label>
                                <textarea class="form-control" rows="5" id="wa-conf" 
                                          placeholder='{"key": "value"}'>${plugin.config.conf?JSON.stringify(plugin.config.conf, null, 2):''}</textarea>
                                <small class="form-text text-muted">WebAssembly模块的扩展配置参数</small>
                            </div>
                        </div>
                    </div>
                `);
            case 'body-transformer':
                return wrap(`
                    <!-- 字段操作配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-list-bulleted me-2"></i>字段操作配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-delete me-1"></i>删除字段
                                    </label>
                                    <textarea class="form-control" rows="4" id="bt-remove" 
                                              placeholder='["field1", "field2"]'>${plugin.config.remove?JSON.stringify(plugin.config.remove, null, 2):''}</textarea>
                                    <small class="form-text text-muted">要删除的字段名称数组</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-content-cut me-1"></i>替换字段
                                    </label>
                                    <textarea class="form-control" rows="4" id="bt-replace" 
                                              placeholder='{"old_field": "new_value"}'>${plugin.config.replace?JSON.stringify(plugin.config.replace, null, 2):''}</textarea>
                                    <small class="form-text text-muted">字段替换规则对象</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 内容配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-content-save me-2"></i>内容配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-plus me-1"></i>追加字段
                                    </label>
                                    <textarea class="form-control" rows="4" id="bt-append" 
                                              placeholder='{"new_field": "value"}'>${plugin.config.append?JSON.stringify(plugin.config.append, null, 2):''}</textarea>
                                    <small class="form-text text-muted">要追加的字段对象</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-format-list-text me-1"></i>内容类型
                                    </label>
                                    <select class="form-select" id="bt-ctype">
                                        <option ${plugin.config.content_type==='json'?'selected':''} value="json">JSON</option>
                                        <option ${plugin.config.content_type==='xml'?'selected':''} value="xml">XML</option>
                                        <option ${plugin.config.content_type==='form'?'selected':''} value="form">Form</option>
                                    </select>
                                    <small class="form-text text-muted">请求体的内容类型</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            case 'attach-consumer-label':
                return wrap(`
                    <!-- Header配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-format-header-pound me-2"></i>Header配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label fw-bold">
                                        <i class="mdi mdi-tag me-1"></i>Header名称
                                    </label>
                                    <input type="text" class="form-control" id="acl-header" 
                                           value="${plugin.config.header||'X-Consumer-Label'}" 
                                           placeholder="X-Consumer-Label">
                                    <small class="form-text text-muted">消费者标签的HTTP头名称</small>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="acl-overwrite" 
                                               ${plugin.config.overwrite?'checked':''}>
                                        <label class="form-check-label fw-bold" for="acl-overwrite">
                                            <i class="mdi mdi-content-save me-1"></i>覆盖已有值
                                        </label>
                                        <small class="form-text text-muted d-block">是否覆盖已存在的Header值</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 标签配置区域 -->
                    <div class="card mb-4 border-0 shadow-sm">
                        <div class="card-header bg-light text-dark">
                            <h6 class="mb-0">
                                <i class="mdi mdi-label me-2"></i>标签配置
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="mdi mdi-format-list-bulleted me-1"></i>标签值
                                </label>
                                <textarea class="form-control" rows="4" id="acl-values" 
                                          placeholder='["label1", "label2"]'>${plugin.config.values?JSON.stringify(plugin.config.values, null, 2):''}</textarea>
                                <small class="form-text text-muted">要附加的消费者标签数组</small>
                            </div>
                        </div>
                    </div>
                `);
            default:
                return wrap(`
                    <div class="form-group">
                        <label class="form-label">备注</label>
                        <input type="text" class="form-control" id="plugin02-note" value="${plugin.note||''}">
                    </div>
                `);
        }
    }

    loadDefaultContent(contentDiv, page) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="mdi mdi-cog mdi-48px text-muted"></i>
                            <h4 class="mt-3">${this.getPageTitle(page)}</h4>
                            <p class="text-muted">此页面正在开发中...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 更新排序图标
    updateSortIcons(tableId, sortField, direction) {
        console.log('更新排序图标，表格ID:', tableId, '字段:', sortField, '方向:', direction);
        
        const table = document.getElementById(tableId);
        if (!table) {
            console.log('表格未找到:', tableId);
            return;
        }
        
        // 重置所有排序图标
        const allHeaders = table.querySelectorAll('.sortable');
        console.log('找到可排序列数量:', allHeaders.length);
        
        allHeaders.forEach(header => {
            const icon = header.querySelector('i');
            if (icon) {
                icon.className = 'mdi mdi-sort';
            }
        });
        
        // 设置当前排序列的图标
        const currentHeader = table.querySelector(`[data-sort="${sortField}"]`);
        if (currentHeader) {
            const icon = currentHeader.querySelector('i');
            if (icon) {
                if (direction === 'asc') {
                    icon.className = 'mdi mdi-sort-ascending';
                } else {
                    icon.className = 'mdi mdi-sort-descending';
                }
                console.log('排序图标已更新为:', direction === 'asc' ? '升序' : '降序');
            }
        } else {
            console.log('未找到排序列:', sortField);
        }
    }

    showNotification(message, type = 'info') {
        // 简单的通知显示方法
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'success' ? 'success' : type === 'danger' ? 'danger' : 'info'} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        `;

        document.body.appendChild(notification);

        // 3秒后自动消失
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);

        // 点击关闭按钮
        notification.querySelector('.close').addEventListener('click', () => {
            notification.remove();
        });
    }

    // 自定义确认对话框（可配置样式/大小/标题/图标）
    showConfirm(message, onConfirm, options = {}) {
        const modalId = `confirm-modal-${Date.now()}`;
        const title = options.title || '请确认';
        const variant = options.variant || 'primary'; // primary|danger|warning|info|success|secondary|dark
        const icon = options.icon || (variant === 'danger' ? 'mdi-alert' : variant === 'warning' ? 'mdi-alert-outline' : variant === 'success' ? 'mdi-check-circle' : 'mdi-information');
        const size = options.size || ''; // '', 'sm', 'lg', 'xl'
        const centered = options.centered === true ? 'modal-dialog-centered' : '';
        const confirmText = options.confirmText || '确定';
        const cancelText = options.cancelText || '取消';
        const confirmBtnClass = options.confirmBtnClass || `btn-${variant}`;
        const cancelBtnClass = options.cancelBtnClass || 'btn-secondary';
        const modalClass = options.modalClass || '';
        const headerClass = options.headerClass || `bg-${variant} text-white`;
        const bodyClass = options.bodyClass || '';
        const footerClass = options.footerClass || '';

        const sizeClass = size ? `modal-${size}` : '';

        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog ${sizeClass} ${centered}">
                    <div class="modal-content ${modalClass}">
                        <div class="modal-header ${headerClass}">
                            <h5 class="modal-title d-flex align-items-center mb-0">
                                <i class="mdi ${icon} mr-2"></i>${title}
                            </h5>
                            <button type="button" class="close text-white" data-dismiss="modal"><span>&times;</span></button>
                        </div>
                        <div class="modal-body ${bodyClass}">
                            <p class="mb-0">${message}</p>
                        </div>
                        <div class="modal-footer ${footerClass}">
                            <button type="button" class="btn ${cancelBtnClass}" data-dismiss="modal">${cancelText}</button>
                            <button type="button" class="btn ${confirmBtnClass}" id="${modalId}-confirm-btn">${confirmText}</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const confirmBtn = document.getElementById(`${modalId}-confirm-btn`);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (typeof onConfirm === 'function') onConfirm();
                $(`#${modalId}`).modal('hide');
            });
        }
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            const modal = document.getElementById(modalId);
            if (modal) modal.remove();
        });
        // 支持传入 backdrop/keyboard
        const modalOptions = {};
        if (options.backdrop !== undefined) modalOptions.backdrop = options.backdrop;
        if (options.keyboard !== undefined) modalOptions.keyboard = options.keyboard;
        $(`#${modalId}`).modal(modalOptions);
        $(`#${modalId}`).modal('show');
    }

    // 加载系统设置页面内容
    loadSystemSettingsContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h4 class="card-title">系统设置</h4>
                            <p class="text-muted">配置系统基本参数和功能选项</p>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label>系统名称</label>
                                        <input type="text" class="form-control" value="APISIX Admin Panel" placeholder="输入系统名称">
                                                </div>
                                    <div class="form-group">
                                        <label>系统版本</label>
                                        <input type="text" class="form-control" value="1.0.0" placeholder="输入系统版本">
                                                </div>
                                    <div class="form-group">
                                        <label>管理员邮箱</label>
                                        <input type="email" class="form-control" value="admin@example.com" placeholder="输入管理员邮箱">
                                            </div>
                                        </div>
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label>时区设置</label>
                                        <select class="form-control">
                                            <option>UTC</option>
                                            <option selected>Asia/Shanghai</option>
                                            <option>America/New_York</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>语言设置</label>
                                        <select class="form-control">
                                            <option selected>中文</option>
                                            <option>English</option>
                                        </select>
                                </div>
                                    <div class="form-group">
                                        <label>主题设置</label>
                                        <select class="form-control">
                                            <option selected>默认主题</option>
                                            <option>深色主题</option>
                                            <option>浅色主题</option>
                                        </select>
                                                </div>
                                                </div>
                                            </div>
                            
                            <div class="text-right mt-3">
                                <button class="btn btn-primary">保存设置</button>
                                <button class="btn btn-secondary ml-2">重置设置</button>
                            </div>
                        </div>
        `;
    }

    // 加载用户管理页面内容
    loadUserManagementContent(contentDiv) {
        contentDiv.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h4 class="card-title">用户管理</h4>
                                <button class="btn btn-primary">
                                    <i class="mdi mdi-plus"></i> 新增用户
                                </button>
                            </div>
                            
                            <div class="table-responsive">
                                <table class="table table-centered table-nowrap mb-0">
                                    <thead>
                                        <tr>
                                            <th>用户ID</th>
                                            <th>用户名</th>
                                            <th>邮箱</th>
                                            <th>角色</th>
                                            <th>状态</th>
                                            <th>创建时间</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>1</td>
                                            <td>admin</td>
                                            <td>admin@example.com</td>
                                            <td><span class="badge badge-primary">超级管理员</span></td>
                                            <td><span class="badge badge-success">启用</span></td>
                                            <td>2024-01-01</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary">编辑</button>
                                                <button class="btn btn-sm btn-outline-danger ml-1">删除</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>2</td>
                                            <td>user1</td>
                                            <td>user1@example.com</td>
                                            <td><span class="badge badge-info">普通用户</span></td>
                                            <td><span class="badge badge-success">启用</span></td>
                                            <td>2024-01-02</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary">编辑</button>
                                                <button class="btn btn-sm btn-outline-danger ml-1">删除</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                                </div>
                                            </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==================== 全局配置预览功能 ====================
    
    // 预览全局配置
    previewGlobalConfig() {
        const globalConfig = this.collectGlobalConfigData();
        this.showGlobalConfigPreviewModal(globalConfig);
    }

    // 收集全局配置数据
    collectGlobalConfigData() {
        // 添加调试信息
        console.log('收集配置数据 - 上游数据:', this.upstreamsData);
        console.log('收集配置数据 - 服务数据:', this.servicesData);
        console.log('收集配置数据 - 路由数据:', this.routesData);
        console.log('收集配置数据 - 消费者数据:', this.consumersData);
        
        const config = {
            // 系统概览
            system: {
                totalUpstreams: this.upstreamsData.length,
                totalServices: this.servicesData.length,
                totalRoutes: this.routesData.length,
                totalConsumers: this.consumersData.length,
                lastUpdated: new Date().toLocaleString('zh-CN')
            },
            
            // 上游服务配置
            upstreams: this.upstreamsData.map(upstream => ({
                id: upstream.id,
                name: upstream.name,
                type: upstream.type,
                nodes: upstream.nodes,
                description: upstream.description
            })),
            
            // 服务配置
            services: this.servicesData.map(service => ({
                id: service.id,
                name: service.name,
                upstream_id: service.upstream,
                plugins: service.plugins || [],
                description: service.description
            })),
            
            // 路由配置
            routes: this.routesData.map(route => ({
                id: route.id,
                uri: route.uri,
                methods: route.methods,
                service_id: route.service,
                plugins: route.plugins || []
            })),
            
            // 消费者配置
            consumers: this.consumersData.map(consumer => ({
                id: consumer.id,
                username: consumer.username,
                authType: consumer.authType,
                group: consumer.group,
                priority: consumer.priority,
                status: consumer.status,
                routes: consumer.routes || [],
                plugins: consumer.plugins || []
            })),
            
            // 配置关系图
            relationships: this.buildConfigRelationships()
        };
        
        console.log('最终配置对象:', config);
        return config;
    }

    // 构建配置关系图
    buildConfigRelationships() {
        const relationships = {
            upstreamToServices: {},
            serviceToRoutes: {},
            consumerToRoutes: {},
            pluginUsage: {}
        };
        
        // 上游 → 服务关系
        this.servicesData.forEach(service => {
            if (service.upstream) {
                if (!relationships.upstreamToServices[service.upstream]) {
                    relationships.upstreamToServices[service.upstream] = [];
                }
                relationships.upstreamToServices[service.upstream].push(service.id);
            }
        });
        
        // 服务 → 路由关系
        this.routesData.forEach(route => {
            if (route.service) {
                if (!relationships.serviceToRoutes[route.service]) {
                    relationships.serviceToRoutes[route.service] = [];
                }
                relationships.serviceToRoutes[route.service].push(route.id);
            }
        });
        
        // 消费者 → 路由关系（通过路由配置反向查找）
        this.consumersData.forEach(consumer => {
            relationships.consumerToRoutes[consumer.id] = [];
        });
        
        // 从路由配置中查找消费者关联
        this.routesData.forEach(route => {
            if (route.consumer && relationships.consumerToRoutes[route.consumer]) {
                relationships.consumerToRoutes[route.consumer].push(route.id);
            }
        });
        
        // 插件使用情况
        const allPlugins = [];
        this.servicesData.forEach(service => {
            if (service.plugins) {
                allPlugins.push(...service.plugins);
            }
        });
        this.routesData.forEach(route => {
            if (route.plugins) {
                allPlugins.push(...route.plugins);
            }
        });
        this.consumersData.forEach(consumer => {
            if (consumer.plugins) {
                allPlugins.push(...consumer.plugins);
            }
        });
        
        // 统计插件使用
        allPlugins.forEach(plugin => {
            if (!relationships.pluginUsage[plugin.plugin_name]) {
                relationships.pluginUsage[plugin.plugin_name] = 0;
            }
            relationships.pluginUsage[plugin.plugin_name]++;
        });
        
        return relationships;
    }

    // 显示全局配置预览模态框
    showGlobalConfigPreviewModal(globalConfig) {
        // 添加调试信息
        console.log('全局配置数据:', globalConfig);
        console.log('JSON字符串:', JSON.stringify(globalConfig, null, 2));
        
        const modalHTML = `
            <div class="modal fade" id="globalConfigPreviewModal" tabindex="-1" aria-labelledby="globalConfigPreviewModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title" id="globalConfigPreviewModalLabel">
                                <i class="mdi mdi-eye me-2"></i>全局配置预览
                            </h5>
                            <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal" style="font-size: 1.5rem; line-height: 1; text-decoration: none;">
                                <i class="mdi mdi-close"></i>
                            </button>
                        </div>
                        <div class="modal-body p-0">
                            <!-- 系统概览 -->
                            <div class="card border-0 rounded-0">
                                <div class="card-header bg-gradient-primary text-white">
                                    <h6 class="mb-0"><i class="mdi mdi-information-outline me-2"></i>系统概览</h6>
                                </div>
                                <div class="card-body bg-light">
                                    <div class="row text-center">
                                        <div class="col-md-3 mb-3">
                                            <div class="bg-white border rounded p-4 shadow-sm">
                                                <div class="text-primary mb-2">
                                                    <i class="mdi mdi-server-network mdi-36px"></i>
                                                </div>
                                                <h3 class="text-primary mb-1">${globalConfig.system.totalUpstreams}</h3>
                                                <small class="text-muted fw-bold">上游服务</small>
                                            </div>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <div class="bg-white border rounded p-4 shadow-sm">
                                                <div class="text-success mb-2">
                                                    <i class="mdi mdi-cog mdi-36px"></i>
                                                </div>
                                                <h3 class="text-success mb-1">${globalConfig.system.totalServices}</h3>
                                                <small class="text-muted fw-bold">服务</small>
                                            </div>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <div class="bg-white border rounded p-4 shadow-sm">
                                                <div class="text-info mb-2">
                                                    <i class="mdi mdi-routes mdi-36px"></i>
                                                </div>
                                                <h3 class="text-info mb-1">${globalConfig.system.totalRoutes}</h3>
                                                <small class="text-muted fw-bold">路由</small>
                                            </div>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <div class="bg-white border rounded p-4 shadow-sm">
                                                <div class="text-warning mb-2">
                                                    <i class="mdi mdi-account-group mdi-36px"></i>
                                                </div>
                                                <h3 class="text-warning mb-1">${globalConfig.system.totalConsumers}</h3>
                                                <small class="text-muted fw-bold">消费者</small>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-center mt-3">
                                        <span class="badge bg-secondary">
                                            <i class="mdi mdi-clock me-1"></i>最后更新: ${globalConfig.system.lastUpdated}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 配置关系图 -->
                            <div class="card border-0 rounded-0 border-top">
                                <div class="card-header bg-gradient-info text-white">
                                    <h6 class="mb-0"><i class="mdi mdi-sitemap me-2"></i>配置关系图</h6>
                                </div>
                                <div class="card-body bg-light">
                                    ${this.renderConfigRelationships(globalConfig.relationships)}
                                </div>
                            </div>
                            
                            <!-- 详细配置 -->
                            <div class="card border-0 rounded-0 border-top">
                                <div class="card-header bg-gradient-success text-white">
                                    <h6 class="mb-0"><i class="mdi mdi-cogs me-2"></i>详细配置</h6>
                                </div>
                                <div class="card-body bg-light">
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <div class="card h-100 border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0"><i class="mdi mdi-server me-2"></i>上游服务配置</h6>
                                                </div>
                                                <div class="card-body" style="max-height: 250px; overflow-y: auto;">
                                                    ${this.renderUpstreamsPreview(globalConfig.upstreams)}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6 mb-3">
                                            <div class="card h-100 border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0"><i class="mdi mdi-cog me-2"></i>服务配置</h6>
                                                </div>
                                                <div class="card-body" style="max-height: 250px; overflow-y: auto;">
                                                    ${this.renderServicesPreview(globalConfig.services)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <div class="card h-100 border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0"><i class="mdi mdi-routes me-2"></i>路由配置</h6>
                                                </div>
                                                <div class="card-body" style="max-height: 250px; overflow-y: auto;">
                                                    ${this.renderRoutesPreview(globalConfig.routes)}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6 mb-3">
                                            <div class="card h-100 border-0 shadow-sm">
                                                <div class="card-header bg-light">
                                                    <h6 class="mb-0"><i class="mdi mdi-account-group me-2"></i>消费者配置</h6>
                                                </div>
                                                <div class="card-body" style="max-height: 250px; overflow-y: auto;">
                                                    ${this.renderConsumersPreview(globalConfig.consumers)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 完整JSON配置 -->
                            <div class="card border-0 rounded-0 border-top">
                                <div class="card-header bg-gradient-dark text-white">
                                    <h6 class="mb-0"><i class="mdi mdi-code-json me-2"></i>完整配置 (JSON)</h6>
                                </div>
                                <div class="card-body bg-light">
                                    <div class="bg-dark text-light p-4 rounded shadow-sm" style="max-height: 500px; overflow-y: auto;">
                                        <pre class="mb-0 text-light" style="font-size: 0.875rem; line-height: 1.5;"><code>${JSON.stringify(globalConfig, null, 2)}</code></pre>
                                    </div>
                                    <div class="mt-3 text-center">
                                        <span class="badge bg-info">
                                            <i class="mdi mdi-information me-1"></i>数据长度: ${JSON.stringify(globalConfig).length} 字符
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer bg-light sticky-bottom border-top">
                            <div class="d-flex justify-content-between align-items-center w-100">
                                <div class="d-flex align-items-center">
                                    <span class="text-muted me-3">
                                        <i class="mdi mdi-information-outline me-1"></i>
                                        预览完成后，点击"应用所有配置"将配置部署到APISIX网关
                                    </span>
                                </div>
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">
                                        <i class="mdi mdi-close me-2"></i>关闭预览
                                    </button>
                                    <button type="button" class="btn btn-success btn-lg px-4" onclick="window.apisixAdmin.applyAllConfigsToAPISIX()">
                                        <i class="mdi mdi-rocket-launch me-2"></i>应用所有配置
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById('globalConfigPreviewModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新的模态框到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('globalConfigPreviewModal'));
        modal.show();
        
        // 模态框关闭后清理DOM
        document.getElementById('globalConfigPreviewModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 渲染配置关系图
    renderConfigRelationships(relationships) {
        let html = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-gradient-info text-white">
                    <h6 class="mb-0"><i class="mdi mdi-sitemap me-2"></i>配置关系图</h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="text-center" style="width: 20%;">上游</th>
                                    <th class="text-center" style="width: 5%;"></th>
                                    <th class="text-center" style="width: 20%;">服务</th>
                                    <th class="text-center" style="width: 5%;"></th>
                                    <th class="text-center" style="width: 20%;">路由</th>
                                    <th class="text-center" style="width: 5%;"></th>
                                    <th class="text-center" style="width: 20%;">消费者</th>
                                    <th class="text-center" style="width: 5%;">JSON</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        // 生成关系行
        const allRelationships = this.generateRelationshipRows(relationships);
        
        if (allRelationships.length === 0) {
            html += `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        <i class="mdi mdi-information-outline me-2"></i>暂无配置关系
                    </td>
                </tr>
            `;
        } else {
            allRelationships.forEach((row, index) => {
                html += `
                    <tr class="border-bottom">
                        <td class="text-center">
                            <span class="badge bg-primary">${row.upstream || '-'}</span>
                        </td>
                        <td class="text-center">
                            <i class="mdi mdi-arrow-right text-muted"></i>
                        </td>
                        <td class="text-center">
                            <span class="badge bg-success">${row.service || '-'}</span>
                        </td>
                        <td class="text-center">
                            <i class="mdi mdi-arrow-right text-muted"></i>
                        </td>
                        <td class="text-center">
                            <span class="badge bg-info">${row.route || '-'}</span>
                        </td>
                        <td class="text-center">
                            <i class="mdi mdi-arrow-right text-muted"></i>
                        </td>
                        <td class="text-center">
                            <span class="badge bg-warning">${row.consumer || '-'}</span>
                        </td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.apisixAdmin.showRelationshipJSON(${index})">
                                <i class="mdi mdi-code-json"></i>
                            </button>
                            <input type="hidden" id="relationship-data-${index}" value='${JSON.stringify(row)}'>
                        </td>
                    </tr>
                `;
            });
        }
        
        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }
    
    // 生成关系行数据
    generateRelationshipRows(relationships) {
        const rows = [];
        
        // 获取所有数据
        const allConsumers = this.consumersData || [];
        const allRoutes = this.routesData || [];
        const allServices = this.servicesData || [];
        
        // 遍历每个消费者，生成其对应的链路
        allConsumers.forEach(consumer => {
            if (consumer.routes && consumer.routes.length > 0) {
                // 消费者有关联路由
                consumer.routes.forEach(routeId => {
                    const route = allRoutes.find(r => r.id === routeId);
                    if (route) {
                        if (route.service) {
                            // 完整链路：消费者 → 路由 → 服务 → 上游
                            const service = allServices.find(s => s.id === route.service);
                            if (service && service.upstream) {
                                rows.push({
                                    consumer: consumer.id,
                                    route: routeId,
                                    service: route.service,
                                    upstream: service.upstream,
                                    type: 'complete-chain'
                                });
                            } else {
                                // 部分链路：消费者 → 路由 → 服务
                                rows.push({
                                    consumer: consumer.id,
                                    route: routeId,
                                    service: route.service,
                                    upstream: '-',
                                    type: 'consumer-route-service'
                                });
                            }
                        } else {
                            // 部分链路：消费者 → 路由
                            rows.push({
                                consumer: consumer.id,
                                route: routeId,
                                service: '-',
                                upstream: '-',
                                type: 'consumer-route'
                            });
                        }
                    }
                });
            } else {
                // 消费者没有关联路由，也要显示
                rows.push({
                    consumer: consumer.id,
                    route: '-',
                    service: '-',
                    upstream: '-',
                    type: 'consumer-only'
                });
            }
        });
        
        console.log('生成的链路行数据:', rows);
        return rows;
    }
    
    // 显示关系JSON详情
    showRelationshipJSON(index) {
        const hiddenInput = document.getElementById(`relationship-data-${index}`);
        if (!hiddenInput) return;
        
        try {
            const row = JSON.parse(hiddenInput.value);
            
            // 创建JSON预览模态框
            const modalHTML = `
                <div class="modal fade" id="relationshipJSONModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white">
                                <h5 class="modal-title">
                                    <i class="mdi mdi-code-json me-2"></i>关系配置详情
                                </h5>
                                <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal">
                                    <i class="mdi mdi-close"></i>
                                </button>
                            </div>
                            <div class="modal-body">
                                <div class="bg-dark text-light p-3 rounded">
                                    <pre class="mb-0 text-light" style="font-size: 0.875rem; line-height: 1.5; color: #ffffff !important;"><code style="color: #ffffff !important;">${JSON.stringify(row, null, 2)}</code></pre>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 移除已存在的模态框
            const existingModal = document.getElementById('relationshipJSONModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // 添加新的模态框到页面
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // 显示模态框
            const modal = new bootstrap.Modal(document.getElementById('relationshipJSONModal'));
            modal.show();
            
            // 模态框关闭后清理DOM
            document.getElementById('relationshipJSONModal').addEventListener('hidden.bs.modal', function() {
                this.remove();
            });
        } catch (error) {
            console.error('解析关系数据失败:', error);
        }
    }

    // 渲染上游服务预览
    renderUpstreamsPreview(upstreams) {
        if (!upstreams || upstreams.length === 0) {
            return '<div class="text-muted text-center py-4"><i class="mdi mdi-information-outline me-2"></i>暂无上游服务配置</div>';
        }
        
        return upstreams.map(upstream => `
            <div class="border-start border-primary border-3 ps-3 py-2 mb-3 bg-white rounded shadow-sm">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 fw-bold text-primary">${upstream.name}</h6>
                        <small class="text-muted">ID: ${upstream.id}</small>
                    </div>
                    <span class="badge bg-secondary ms-2">${upstream.type}</span>
                </div>
                <div class="d-flex align-items-center">
                    <i class="mdi mdi-server-network text-primary me-2"></i>
                    <small class="text-muted">节点数量: <span class="fw-bold">${upstream.nodes.length}</span> 个</small>
                </div>
            </div>
        `).join('');
    }

    // 渲染服务预览
    renderServicesPreview(services) {
        if (!services || services.length === 0) {
            return '<div class="text-muted text-center py-4"><i class="mdi mdi-information-outline me-2"></i>暂无服务配置</div>';
        }
        
        return services.map(service => `
            <div class="border-start border-success border-3 ps-3 py-2 mb-3 bg-white rounded shadow-sm">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 fw-bold text-success">${service.name}</h6>
                        <small class="text-muted">ID: ${service.id}</small>
                    </div>
                    <span class="badge bg-success ms-2">${service.upstream_id || '无上游'}</span>
                </div>
                <div class="d-flex align-items-center">
                    <i class="mdi mdi-puzzle text-success me-2"></i>
                    <small class="text-muted">插件数量: <span class="fw-bold">${service.plugins.length}</span> 个</small>
                </div>
            </div>
        `).join('');
    }

    // 渲染路由预览
    renderRoutesPreview(routes) {
        if (!routes || routes.length === 0) {
            return '<div class="text-muted text-center py-4"><i class="mdi mdi-information-outline me-2"></i>暂无路由配置</div>';
        }
        
        return routes.map(route => `
            <div class="border-start border-info border-3 ps-3 py-2 mb-3 bg-white rounded shadow-sm">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 fw-bold text-info">${route.uri}</h6>
                        <small class="text-muted">ID: ${route.id}</small>
                    </div>
                    <span class="badge bg-info ms-2">${route.service || '无服务'}</span>
                </div>
                <div class="d-flex align-items-center">
                    <i class="mdi mdi-http text-info me-2"></i>
                    <small class="text-muted">方法: <span class="fw-bold">${route.methods.join(', ')}</span></small>
                </div>
            </div>
        `).join('');
    }

    // 渲染消费者预览
    renderConsumersPreview(consumers) {
        if (!consumers || consumers.length === 0) {
            return '<div class="text-muted text-center py-4"><i class="mdi mdi-information-outline me-2"></i>暂无消费者配置</div>';
        }
        
        return consumers.map(consumer => `
            <div class="border-start border-warning border-3 ps-3 py-2 mb-3 bg-white rounded shadow-sm">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 fw-bold text-warning">${consumer.username}</h6>
                        <small class="text-muted">ID: ${consumer.id}</small>
                    </div>
                    <span class="badge bg-warning text-dark ms-2">${consumer.status}</span>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="d-flex align-items-center">
                        <i class="mdi mdi-routes text-warning me-2"></i>
                        <small class="text-muted">路由: <span class="fw-bold">${consumer.routes.length}</span></small>
                    </div>
                    <div class="d-flex align-items-center">
                        <i class="mdi mdi-puzzle text-warning me-2"></i>
                        <small class="text-muted">插件: <span class="fw-bold">${consumer.plugins.length}</span></small>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 应用所有配置到APISIX
    async applyAllConfigsToAPISIX() {
        try {
        this.showNotification('正在应用配置到APISIX网关...', 'info');
        
            // 获取所有配置数据
            const routes = this.loadFromStorage('routes') || [];
            const services = this.loadFromStorage('services') || [];
            const upstreams = this.loadFromStorage('upstreams') || [];
            const consumers = this.loadFromStorage('consumers') || [];
            
            console.log('准备应用配置到APISIX:', { routes, services, upstreams, consumers });
            
            // 按顺序创建：上游 -> 服务 -> 路由 -> 消费者
            const results = {
                upstreams: [],
                services: [],
                routes: [],
                consumers: []
            };
            
            // 1. 创建上游
            for (const upstream of upstreams) {
                try {
                    // 转换节点格式
                    const nodes = upstream.nodes ? upstream.nodes.map(node => ({
                        host: node.host,
                        port: parseInt(node.port) || 80,
                        weight: parseInt(node.weight) || 1
                    })) : [];
                    
                    const upstreamData = {
                        type: upstream.type || 'roundrobin',
                        nodes: nodes,
                        timeout: {
                            connect: parseInt(upstream.timeout?.connect) || 6000,
                            send: parseInt(upstream.timeout?.send) || 60000,
                            read: parseInt(upstream.timeout?.read) || 60000
                        },
                        retries: parseInt(upstream.retries) || 1,
                        desc: upstream.description || upstream.name || upstream.id
                    };
                    
                    console.log(`准备创建上游 ${upstream.id}:`, upstreamData);
                    
                    const response = await this.apisixRequest(`/upstreams/${upstream.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(upstreamData)
                    });
                    
                    results.upstreams.push({ id: upstream.id, success: true, data: response });
                    console.log(`上游 ${upstream.id} 创建成功:`, response);
                } catch (error) {
                    console.error(`上游 ${upstream.id} 创建失败:`, error);
                    results.upstreams.push({ id: upstream.id, success: false, error: error.message });
                }
            }
            
            // 2. 创建服务
            for (const service of services) {
                try {
                    // 确保plugins是对象格式，不是数组
                    let plugins = {};
                    
                    // 优先使用pluginConfigs字段（新的插件配置格式）
                    if (service.pluginConfigs && Array.isArray(service.pluginConfigs)) {
                        service.pluginConfigs.forEach(plugin => {
                            if (plugin.plugin_name) {
                                // 对插件配置进行验证和清理
                                let cleanConfig = { ...plugin.config };
                                
                                // 特殊处理cors插件的配置
                                if (plugin.plugin_name === 'cors') {
                                    // 如果allow_origins_by_regex是空数组，设置为undefined或删除该字段
                                    if (cleanConfig.allow_origins_by_regex && Array.isArray(cleanConfig.allow_origins_by_regex) && cleanConfig.allow_origins_by_regex.length === 0) {
                                        delete cleanConfig.allow_origins_by_regex;
                                    }
                                }
                                
                                plugins[plugin.plugin_name] = cleanConfig;
                            }
                        });
                    }
                    // 兼容旧的plugins字段
                    else if (service.plugins && typeof service.plugins === 'object') {
                        if (Array.isArray(service.plugins)) {
                            service.plugins.forEach(plugin => {
                                if (plugin.plugin_name) {
                                    plugins[plugin.plugin_name] = plugin.config || {};
                                }
                            });
                        } else {
                            plugins = service.plugins;
                        }
                    }
                    
                    const serviceData = {
                        upstream_id: service.upstream || service.upstream_id || service.upstreamId,
                        plugins: plugins,
                        desc: service.description || service.name || service.id
                    };
                    
                    console.log(`准备创建服务 ${service.id}:`, serviceData);
                    
                    const response = await this.apisixRequest(`/services/${service.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(serviceData)
                    });
                    
                    results.services.push({ id: service.id, success: true, data: response });
                    console.log(`服务 ${service.id} 创建成功:`, response);
                } catch (error) {
                    console.error(`服务 ${service.id} 创建失败:`, error);
                    results.services.push({ id: service.id, success: false, error: error.message });
                }
            }
            
            // 3. 创建路由
            for (const route of routes) {
                try {
                    // 确保plugins是对象格式，不是数组
                    let plugins = {};
                    if (route.plugins && typeof route.plugins === 'object') {
                        if (Array.isArray(route.plugins)) {
                            // 如果是数组，转换为对象
                            route.plugins.forEach(plugin => {
                                if (plugin.plugin_name) {
                                    plugins[plugin.plugin_name] = plugin.config || {};
                                }
                            });
                        } else {
                            plugins = route.plugins;
                        }
                    }
                    
                    const routeData = {
                        uri: route.uri,
                        methods: Array.isArray(route.methods) ? route.methods : [route.methods || 'GET'],
                        service_id: route.service || route.service_id || route.serviceId,
                        plugins: plugins,
                        priority: parseInt(route.priority) || 0,
                        desc: route.description || route.name || route.id,
                        status: route.status === 'enabled' ? 1 : 0
                    };
                    
                    console.log(`准备创建路由 ${route.id}:`, routeData);
                    
                    const response = await this.apisixRequest(`/routes/${route.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(routeData)
                    });
                    
                    results.routes.push({ id: route.id, success: true, data: response });
                    console.log(`路由 ${route.id} 创建成功:`, response);
                } catch (error) {
                    console.error(`路由 ${route.id} 创建失败:`, error);
                    results.routes.push({ id: route.id, success: false, error: error.message });
                }
            }
            
            // 4. 创建消费者
            for (const consumer of consumers) {
                try {
                    // 确保plugins是对象格式，不是数组
                    let plugins = {};
                    if (consumer.plugins && typeof consumer.plugins === 'object') {
                        if (Array.isArray(consumer.plugins)) {
                            // 如果是数组，转换为对象
                            consumer.plugins.forEach(plugin => {
                                if (plugin.plugin_name) {
                                    plugins[plugin.plugin_name] = plugin.config || {};
                                }
                            });
                        } else {
                            plugins = consumer.plugins;
                        }
                    }
                    
                    // 清理用户名，确保符合APISIX要求
                    let username = consumer.username;
                    if (username) {
                        // 移除特殊字符，只保留字母、数字、下划线、连字符
                        username = username.replace(/[^a-zA-Z0-9_-]/g, '');
                        // 确保不以数字开头
                        if (/^\d/.test(username)) {
                            username = 'user_' + username;
                        }
                        // 确保长度合适
                        if (username.length < 2) {
                            username = 'user_' + username;
                        }
                    } else {
                        // 如果没有用户名，使用ID
                        username = consumer.id.replace(/[^a-zA-Z0-9_-]/g, '');
                        if (/^\d/.test(username)) {
                            username = 'user_' + username;
                        }
                    }
                    
                    // 使用更安全的用户名策略
                    if (!username || username.length < 2 || /^[^a-zA-Z]/.test(username)) {
                        username = 'user' + Date.now();
                    }
                    
                    // APISIX可能不允许下划线，替换为连字符
                    username = username.replace(/_/g, '-');
                    
                    // 先尝试创建最简单的消费者，不包含插件
                    const consumerData = {
                        username: username,
                        desc: consumer.description || consumer.username || consumer.id
                    };
                    
                    // 只有在有插件的情况下才添加plugins字段
                    if (Object.keys(plugins).length > 0) {
                        consumerData.plugins = plugins;
                    }
                    
                    console.log(`准备创建消费者 ${consumer.id}:`, consumerData);
                    console.log(`原始用户名: ${consumer.username}, 清理后: ${username}`);
                    console.log(`消费者完整数据:`, consumer);
                    
                    // APISIX期望的消费者ID就是用户名，不是带前缀的ID
                    const response = await this.apisixRequest(`/consumers/${username}`, {
                        method: 'PUT',
                        body: JSON.stringify(consumerData)
                    });
                    
                    results.consumers.push({ id: consumer.id, success: true, data: response });
                    console.log(`消费者 ${consumer.id} 创建成功:`, response);
                } catch (error) {
                    console.error(`消费者 ${consumer.id} 创建失败:`, error);
                    results.consumers.push({ id: consumer.id, success: false, error: error.message });
                }
            }
            
            // 统计结果
            const totalSuccess = results.upstreams.filter(r => r.success).length + 
                               results.services.filter(r => r.success).length + 
                               results.routes.filter(r => r.success).length + 
                               results.consumers.filter(r => r.success).length;
            const totalCount = upstreams.length + services.length + routes.length + consumers.length;
            
            console.log('配置应用结果:', results);
            
            if (totalSuccess === totalCount) {
                this.showNotification(`所有配置已成功应用到APISIX网关！共应用 ${totalCount} 项配置`, 'success');
            } else {
                this.showNotification(`配置应用完成，成功 ${totalSuccess}/${totalCount} 项，请检查失败项`, 'warning');
            }
            
            // 显示详细结果
            this.showApplyResults(results);
            
        } catch (error) {
            console.error('应用配置到APISIX失败:', error);
            this.showNotification('应用配置失败: ' + error.message, 'error');
        }
    }
    
    // 显示应用结果
    showApplyResults(results) {
        const modalId = 'apply-results-modal';
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="mdi mdi-check-circle me-2"></i>配置应用结果
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6>上游</h6>
                                            <div class="text-success">${results.upstreams.filter(r => r.success).length}/${results.upstreams.length}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6>服务</h6>
                                            <div class="text-success">${results.services.filter(r => r.success).length}/${results.services.length}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6>路由</h6>
                                            <div class="text-success">${results.routes.filter(r => r.success).length}/${results.routes.length}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6>消费者</h6>
                                            <div class="text-success">${results.consumers.filter(r => r.success).length}/${results.consumers.length}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mt-4">
                                <h6>详细结果:</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>类型</th>
                                                <th>ID</th>
                                                <th>状态</th>
                                                <th>详情</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${this.generateResultsTableRows(results)}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById(modalId);
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
    }
    
    // 生成结果表格行
    generateResultsTableRows(results) {
        let rows = '';
        
        // 上游结果
        results.upstreams.forEach(item => {
            rows += `
                <tr class="${item.success ? 'table-success' : 'table-danger'}">
                    <td>上游</td>
                    <td>${item.id}</td>
                    <td>${item.success ? '✅ 成功' : '❌ 失败'}</td>
                    <td>${item.success ? '创建成功' : item.error}</td>
                </tr>
            `;
        });
        
        // 服务结果
        results.services.forEach(item => {
            rows += `
                <tr class="${item.success ? 'table-success' : 'table-danger'}">
                    <td>服务</td>
                    <td>${item.id}</td>
                    <td>${item.success ? '✅ 成功' : '❌ 失败'}</td>
                    <td>${item.success ? '创建成功' : item.error}</td>
                </tr>
            `;
        });
        
        // 路由结果
        results.routes.forEach(item => {
            rows += `
                <tr class="${item.success ? 'table-success' : 'table-danger'}">
                    <td>路由</td>
                    <td>${item.id}</td>
                    <td>${item.success ? '✅ 成功' : '❌ 失败'}</td>
                    <td>${item.success ? '创建成功' : item.error}</td>
                </tr>
            `;
        });
        
        // 消费者结果
        results.consumers.forEach(item => {
            rows += `
                <tr class="${item.success ? 'table-success' : 'table-danger'}">
                    <td>消费者</td>
                    <td>${item.id}</td>
                    <td>${item.success ? '✅ 成功' : '❌ 失败'}</td>
                    <td>${item.success ? '创建成功' : item.error}</td>
                </tr>
            `;
        });
        
        return rows;
    }





    // ==================== 多仪表板管理系统 ====================
    
    // 创建新仪表板
    createNewDashboard() {
        const dashboardName = prompt('请输入新仪表板名称:');
        if (!dashboardName || dashboardName.trim() === '') return;
        
        // 创建新仪表板配置
        const newDashboard = {
            id: 'dashboard_' + Date.now(),
            name: dashboardName.trim(),
            description: '自定义仪表板',
            createdAt: new Date().toISOString(),
            widgets: [],
            layout: 'grid',
            dataSources: []
        };
        
        // 保存到本地存储
        this.saveDashboard(newDashboard);
        
        // 更新选择器
        this.updateDashboardSelector();
        
        // 切换到新仪表板
        this.switchDashboard(newDashboard.id);
        
        this.showNotification(`仪表板 "${dashboardName}" 创建成功`, 'success');
    }
    
    // 切换仪表板
    switchDashboard(dashboardId) {
        // 切换仪表板时一律退出自定义编辑状态
        this.isEditingCustom = null;
        if (dashboardId === 'default') {
            this.showDefaultDashboard();
        } else {
            this.loadCustomDashboard(dashboardId);
        }
        
        // 更新选择器状态（确保存在选项）
        const selector = document.getElementById('dashboard-selector');
        if (selector) {
            // 若当前值不在列表，先刷新下拉
            if (![...selector.options].some(o => o.value === dashboardId)) {
                this.updateDashboardSelector();
            }
            selector.value = dashboardId;
        }
        
        // 确保当前页面状态正确
        this.currentPage = 'dashboard';
    }
    
    // 显示默认仪表板
    showDefaultDashboard() {
        const contentDiv = document.getElementById('current-dashboard-content');
        if (contentDiv) {
            // 检查是否有保存的默认仪表板配置
            const savedDefaultDashboard = this.getDefaultDashboardFromStorage();
            
            if (savedDefaultDashboard && savedDefaultDashboard.widgets && savedDefaultDashboard.widgets.length > 0) {
                // 显示已保存的组件
        contentDiv.innerHTML = `
                    <div class="dashboard-panel" id="default-dashboard">
                        <div class="row" id="default-widgets-display">
                            ${savedDefaultDashboard.widgets.map(widget => this.renderWidgetForView(widget)).join('')}
                                            </div>
                                            </div>
                `;
                // 初始化查看模式组件（图表/占位）
                setTimeout(() => savedDefaultDashboard.widgets.forEach(w => this.initWidget(w, 'view')), 0);
            } else {
                // 显示空的默认仪表板
                contentDiv.innerHTML = `
                    <!-- 默认仪表板 - 空状态 -->
                    <div class="dashboard-panel" id="default-dashboard">
            <div class="row">
                            <div class="col-12">
                                <div class="text-center py-3" style="min-height: 56px;">
                                    <i class="mdi mdi-view-dashboard mdi-36px text-muted"></i>
                                    <span class="ml-2 align-middle text-muted">这是一个空的仪表板，请点击上方工具栏的"编辑"按钮开始添加组件</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                `;
            }
        }
        
        // 确保仪表板导航可以正常工作
        this.currentPage = 'dashboard';
    }
    
    // 从本地存储获取默认仪表板
    getDefaultDashboardFromStorage() {
        const dashboards = this.getAllDashboards();
        return dashboards.find(d => d.id === 'default');
    }
    
    // 为编辑模式加载默认仪表板组件
    loadDefaultWidgetsForEdit() {
        const savedDefaultDashboard = this.getDefaultDashboardFromStorage();
        
        if (savedDefaultDashboard && savedDefaultDashboard.widgets && savedDefaultDashboard.widgets.length > 0) {
            // 显示已保存的组件，带有编辑和删除按钮
            return savedDefaultDashboard.widgets.map(widget => this.renderDefaultWidget(widget)).join('');
        } else {
            // 显示空状态提示
            return `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <i class="mdi mdi-plus-circle mdi-48px text-muted"></i>
                            <h5 class="mt-3">开始构建您的仪表板</h5>
                            <p class="text-muted">点击上方工具栏的"添加组件"按钮开始添加您需要的组件</p>
                    </div>
                </div>
            </div>
        `;
        }
    }
    
    // 重新加载默认仪表板编辑界面的组件
    reloadDefaultWidgetsForEdit() {
        const container = document.getElementById('default-widgets-container');
        if (!container) return;
        
        const savedDefaultDashboard = this.getDefaultDashboardFromStorage();
        
        if (savedDefaultDashboard && savedDefaultDashboard.widgets && savedDefaultDashboard.widgets.length > 0) {
            // 重新渲染所有组件
            container.innerHTML = savedDefaultDashboard.widgets.map(widget => this.renderDefaultWidget(widget)).join('');
        } else {
            // 显示空状态提示
            container.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <i class="mdi mdi-plus-circle mdi-48px text-muted"></i>
                            <h5 class="mt-3">开始构建您的仪表板</h5>
                            <p class="text-muted">点击上方工具栏的"添加组件"按钮开始添加您需要的组件</p>
                    </div>
                </div>
            </div>
        `;
        }
    }
    
    // 加载自定义仪表板
    loadCustomDashboard(dashboardId) {
        const dashboard = this.getDashboard(dashboardId);
        if (!dashboard) {
            this.showNotification('仪表板不存在', 'error');
            return;
        }
        
        const contentDiv = document.getElementById('current-dashboard-content');
        if (!contentDiv) return;
        
        // 构建自定义仪表板内容
        let dashboardHTML = `
            <div class="dashboard-panel" id="${dashboard.id}">
                <div class="row" id="widgets-container-${dashboard.id}">
        `;
        
        // 添加现有组件（查看模式渲染）
        if (dashboard.widgets && dashboard.widgets.length > 0) {
            dashboard.widgets.forEach(widget => {
                dashboardHTML += this.renderWidgetForView(widget);
            });
        } else {
            dashboardHTML += `
                <div class="col-12">
                    <div class="text-center py-3" style="min-height: 56px;">
                        <i class="mdi mdi-chart-line mdi-36px text-muted"></i>
                        <span class="ml-2 align-middle text-muted">暂无数据组件。点击上方工具栏"编辑"进入编辑模式后再添加组件</span>
                    </div>
                </div>
            `;
        }

        dashboardHTML += `
                                        </div>
                                    </div>
        `;
        
        contentDiv.innerHTML = dashboardHTML;
        // 渲染查看模式组件（图表/占位）
        if (dashboard.widgets && dashboard.widgets.length > 0) {
            dashboard.widgets.forEach(w => this.initWidget(w, 'view'));
        }
    }
    
    // 添加组件到仪表板
    addWidget(dashboardId) {
        const widgetTypes = [
            { id: 'metric-card', name: '指标卡片', icon: 'mdi-chart-box', description: '显示单个数值指标' },
            { id: 'line-chart', name: '折线图', icon: 'mdi-chart-line', description: '显示时间序列数据' },
            { id: 'bar-chart', name: '柱状图', icon: 'mdi-chart-bar', description: '显示分类数据对比' },
            { id: 'pie-chart', name: '饼图', icon: 'mdi-chart-pie', description: '显示占比数据' },
            { id: 'table', name: '数据表格', icon: 'mdi-table', description: '显示详细数据列表' },
            { id: 'log-viewer', name: '日志查看器', icon: 'mdi-logout', description: '显示实时日志数据' },
            { id: 'plugin-metrics', name: '插件指标', icon: 'mdi-puzzle', description: '显示APISIX插件数据' },
            { id: 'area-chart', name: '面积图', icon: 'mdi-chart-areaspline', description: '显示时间面积图' },
            { id: 'stacked-bar', name: '堆叠柱状图', icon: 'mdi-chart-bar-stacked', description: '显示堆叠对比' },
            { id: 'scatter-chart', name: '散点图', icon: 'mdi-chart-scatter-plot', description: '显示散点分布' },
            { id: 'histogram', name: '直方图', icon: 'mdi-chart-histogram', description: '显示分布统计' },
            { id: 'gauge', name: '仪表盘', icon: 'mdi-gauge', description: '显示进度或利用率' },
            { id: 'radial-progress', name: '径向进度', icon: 'mdi-gauge-low', description: '显示圆形进度' },
            { id: 'heatmap', name: '热力图', icon: 'mdi-grid', description: '显示热点分布' },
            { id: 'geo-map', name: '地理地图', icon: 'mdi-earth', description: '显示地理分布' },
            { id: 'topology-graph', name: '拓扑图', icon: 'mdi-graph-outline', description: '显示拓扑关系' },
            { id: 'kpi-grid', name: 'KPI 网格', icon: 'mdi-view-grid', description: '多指标紧凑展示' },
            { id: 'availability-panel', name: '可用率', icon: 'mdi-shield-check', description: 'SLA 可用率' },
            { id: 'latency-percentiles', name: '延迟分位', icon: 'mdi-timer-sand', description: 'P50/P90/P99' },
            { id: 'request-distribution', name: '请求分布', icon: 'mdi-poll', description: '按维度分布' },
            { id: 'alerts-feed', name: '告警流', icon: 'mdi-bell-alert', description: '错误与告警' },
            { id: 'log-search', name: '日志搜索', icon: 'mdi-file-search', description: '检索与高亮' },
            { id: 'advanced-table', name: '高级表格', icon: 'mdi-table', description: '分页筛选排序' },
            { id: 'plugin-status', name: '插件状态', icon: 'mdi-puzzle-check', description: '插件运行状态' },
            { id: 'cache-hit', name: '缓存命中率', icon: 'mdi-database-check', description: '命中率与总量' },
            { id: 'ratelimit-stats', name: '限流统计', icon: 'mdi-speedometer', description: '限流与拒绝数' }
        ];
        
        // 创建组件选择对话框
        let dialogHTML = `
            <div class="modal fade" id="widget-selector-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">选择组件类型</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span>&times;</span>
                            </button>
                                </div>
                        <div class="modal-body">
                            <div class="row">
        `;
        
        widgetTypes.forEach(widget => {
            dialogHTML += `
                <div class="col-md-6 mb-3">
                    <div class="card border h-100 widget-type-card" data-widget-type="${widget.id}">
                                        <div class="card-body text-center">
                            <i class="mdi ${widget.icon} mdi-48px text-primary mb-3"></i>
                            <h6 class="card-title">${widget.name}</h6>
                            <p class="text-muted small">${widget.description}</p>
                                        </div>
                                    </div>
                                </div>
            `;
        });
        
        dialogHTML += `
                                        </div>
                                    </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                                </div>
                                        </div>
                                    </div>
                                </div>
        `;
        
        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        
        // 绑定点击事件
        document.querySelectorAll('.widget-type-card').forEach(card => {
            card.addEventListener('click', () => {
                const widgetType = card.dataset.widgetType;
                this.createWidget(dashboardId, widgetType);
                $('#widget-selector-modal').modal('hide');
            });
        });
        
        // 显示对话框
        $('#widget-selector-modal').modal('show');
        
        // 对话框关闭后清理
        $('#widget-selector-modal').on('hidden.bs.modal', function() {
            const modal = document.getElementById('widget-selector-modal');
            if (modal) modal.remove();
        });
    }
    
    // 创建组件（统一方法，支持默认仪表板和自定义仪表板）
    createWidget(dashboardId, widgetType) {
        const widget = {
            id: 'widget_' + Date.now(),
            type: widgetType,
            title: this.getWidgetDefaultTitle(widgetType),
            config: this.getWidgetDefaultConfig(widgetType),
            position: { x: 0, y: 0 },
            size: { width: 6, height: 4 }
        };
        
        if (dashboardId === 'default') {
            // 添加到默认仪表板
            this.addWidgetToDefaultDashboard(widget.id, widget);
        } else {
            // 自定义仪表板：如果处于编辑模式，先添加到编辑容器；否则直接保存并刷新
            if (this.isEditingCustom === dashboardId) {
                this.addWidgetToCustomDashboard(dashboardId, widget);
            } else {
                const dashboard = this.getDashboard(dashboardId);
                if (dashboard) {
                    if (!dashboard.widgets) dashboard.widgets = [];
                    dashboard.widgets.push(widget);
                    this.saveDashboard(dashboard);
                    this.loadCustomDashboard(dashboardId);
                }
            }
        }
        
        this.showNotification('组件添加成功', 'success');
    }
    
    // 获取组件默认标题
    getWidgetDefaultTitle(widgetType) {
        const titles = {
            'metric-card': '新指标',
            'line-chart': '新图表',
            'bar-chart': '新柱状图',
            'pie-chart': '新饼图',
            'table': '新数据表',
            'log-viewer': '日志监控',
            'plugin-metrics': '插件指标',
            'area-chart': '新面积图',
            'stacked-bar': '新堆叠柱状图',
            'scatter-chart': '新散点图',
            'histogram': '新直方图',
            'gauge': '新仪表盘',
            'radial-progress': '新径向进度',
            'heatmap': '新热力图',
            'geo-map': '新地理图',
            'topology-graph': '新拓扑图',
            'kpi-grid': 'KPI 网格',
            'availability-panel': '可用率',
            'latency-percentiles': '延迟分位',
            'request-distribution': '请求分布',
            'alerts-feed': '告警流',
            'log-search': '日志搜索',
            'advanced-table': '高级表格',
            'plugin-status': '插件状态',
            'cache-hit': '缓存命中率',
            'ratelimit-stats': '限流统计'
        };
        return titles[widgetType] || '新组件';
    }

    // 获取组件类型对应的图标类（mdi）
    getWidgetIconClass(widgetType) {
        const map = {
            'metric-card': 'mdi-chart-areaspline',
            'line-chart': 'mdi-chart-line',
            'bar-chart': 'mdi-chart-bar',
            'pie-chart': 'mdi-chart-pie',
            'table': 'mdi-table',
            'log-viewer': 'mdi-logout',
            'plugin-metrics': 'mdi-puzzle',
            'area-chart': 'mdi-chart-areaspline',
            'stacked-bar': 'mdi-chart-bar-stacked',
            'scatter-chart': 'mdi-chart-scatter-plot',
            'histogram': 'mdi-chart-histogram',
            'gauge': 'mdi-gauge',
            'radial-progress': 'mdi-gauge-low',
            'heatmap': 'mdi-grid',
            'geo-map': 'mdi-earth',
            'topology-graph': 'mdi-graph-outline',
            'kpi-grid': 'mdi-view-grid',
            'availability-panel': 'mdi-shield-check',
            'latency-percentiles': 'mdi-timer-sand',
            'request-distribution': 'mdi-poll',
            'alerts-feed': 'mdi-bell-alert',
            'log-search': 'mdi-file-search',
            'advanced-table': 'mdi-table',
            'plugin-status': 'mdi-puzzle-check',
            'cache-hit': 'mdi-database-check',
            'ratelimit-stats': 'mdi-speedometer'
        };
        return map[widgetType] || 'mdi-view-dashboard';
    }

    // 获取组件轴/样式提示（不包含数据，仅样式文案）
    getWidgetStyleHint(widgetType) {
        const timeQtyTypes = new Set(['line-chart','area-chart','bar-chart','stacked-bar','scatter-chart','histogram']);
        if (timeQtyTypes.has(widgetType)) {
            return '<div class="d-flex justify-content-between text-muted small mt-2"><span>X: 时间</span><span>Y: 数量</span></div>';
        }
        if (widgetType === 'pie-chart') {
            return '<div class="text-muted small mt-2">维度占比</div>';
        }
        if (widgetType === 'gauge' || widgetType === 'radial-progress') {
            return '<div class="text-muted small mt-2">百分比</div>';
        }
        return '';
    }
    
    // 获取组件默认配置（不附带任何默认数据/指标）
    getWidgetDefaultConfig(widgetType) {
        return {};
    }

    // 初始化组件（按需渲染）— 不注入任何默认数据或随机图表
    initWidget(widget, mode = 'view') {
        const chartTypes = new Set(['line-chart','area-chart','bar-chart','stacked-bar','scatter-chart','histogram','pie-chart']);
        if (!chartTypes.has(widget.type)) return;

        const draw = () => {
            if (!window.google || !google.visualization) return;
            const el = document.getElementById(`chart-${widget.id}`);
            if (!el) return;

            // 构造简易模拟数据
            const data = new google.visualization.DataTable();
            if (widget.type === 'pie-chart') {
                data.addColumn('string', 'label');
                data.addColumn('number', 'value');
                data.addRows([
                    ['A', 8], ['B', 3], ['C', 5], ['D', 2]
                ]);
            } else if (widget.type === 'scatter-chart') {
                data.addColumn('number', 'X');
                data.addColumn('number', 'Y');
                const rows = [];
                for (let i = 0; i < 20; i++) rows.push([i, Math.floor(Math.random()*100)]);
                data.addRows(rows);
            } else {
                data.addColumn('string', 't');
                data.addColumn('number', 'v');
                const now = Date.now();
                const rows = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(now - i * 60000);
                    const label = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
                    rows.push([label, Math.floor(Math.random()*100)]);
                }
                data.addRows(rows);
            }

            const options = { legend: { position: 'none' }, chartArea: { width: '85%', height: '70%' }, height: 200 };
            let chart;
            switch (widget.type) {
                case 'line-chart':
                case 'area-chart':
                    chart = new google.visualization.LineChart(el);
                    break;
                case 'bar-chart':
                case 'stacked-bar':
                case 'histogram':
                    chart = new google.visualization.ColumnChart(el);
                    if (widget.type === 'stacked-bar') options.isStacked = true;
                    break;
                case 'pie-chart':
                    chart = new google.visualization.PieChart(el);
                    break;
                case 'scatter-chart':
                    chart = new google.visualization.ScatterChart(el);
                    break;
            }
            chart.draw(data, options);
        };

        if (window.google && google.charts) {
            if (!this.googleChartsReady && !this.googleChartsLoading) {
                this.googleChartsLoading = true;
                google.charts.load('current', { packages: ['corechart'] });
                google.charts.setOnLoadCallback(() => { this.googleChartsReady = true; this.googleChartsLoading = false; draw(); });
            } else if (this.googleChartsReady) {
                draw();
            } else {
                const iv = setInterval(() => { if (this.googleChartsReady) { clearInterval(iv); draw(); } }, 100);
            }
        }
    }
    
    // 添加组件到默认仪表板
    addWidgetToDefaultDashboard(widgetId, widget) {
        const container = document.getElementById('default-widgets-container');
        if (!container) return;
        
        // 检查是否是空状态提示（只有空状态提示才需要清空）
        const isEmptyState = container.querySelector('.text-center') && 
                            container.querySelector('.text-center').textContent.includes('开始构建您的仪表板');
        
        if (isEmptyState) {
            container.innerHTML = '';
        }
        
        // 添加新组件
        const widgetHTML = this.renderDefaultWidget(widget);
        container.insertAdjacentHTML('beforeend', widgetHTML);
        const newItem = container.lastElementChild;
        // 确保网格实例存在
        let grid = container.gridstack || GridStack.init({ cellHeight: 80, margin: 8, column: 12 }, container);
        if (grid && newItem) {
            // 注册为可拖拽缩放的网格项
            try { grid.addWidget(newItem); } catch (e) { try { grid.makeWidget(newItem); } catch (_) {} }
        }
        // 初始化组件内容（编辑模式预览）
        setTimeout(() => {
            this.initWidget(widget, 'edit');
        }, 100);
    }
    
    // 渲染组件（编辑模式，包含编辑/删除按钮）
    renderWidget(widget) {
        switch (widget.type) {
            case 'metric-card':
                return this.renderMetricCard(widget);
            case 'line-chart':
                return this.renderLineChart(widget);
            case 'area-chart':
            case 'bar-chart':
            case 'stacked-bar':
            case 'scatter-chart':
            case 'histogram':
            case 'pie-chart':
                return this.renderChartSkeletonEdit(widget);
            case 'table':
            case 'advanced-table':
                return this.renderTableSkeletonEdit(widget);
            case 'log-viewer':
                return this.renderLogViewerEdit(widget);
            case 'plugin-metrics':
                return this.renderPluginMetrics(widget);
            default:
                return this.renderDefaultWidget(widget);
        }
    }
    
    // 渲染组件（查看模式，不包含编辑/删除按钮）
    renderWidgetForView(widget) {
        switch (widget.type) {
            case 'metric-card':
                return this.renderMetricCardForView(widget);
            case 'line-chart':
                return this.renderLineChartForView(widget);
            case 'area-chart':
            case 'bar-chart':
            case 'stacked-bar':
            case 'scatter-chart':
            case 'histogram':
            case 'pie-chart':
                return this.renderChartSkeletonForView(widget);
            case 'table':
            case 'advanced-table':
                return this.renderTableSkeletonForView(widget);
            case 'log-viewer':
                return this.renderLogViewerForView(widget);
            case 'plugin-metrics':
                return this.renderPluginMetricsForView(widget);
            default:
                return this.renderDefaultWidgetForView(widget);
        }
    }

    // --- 通用图表骨架（编辑）
    renderChartSkeletonEdit(widget) {
        return `
            <div class="col-md-${widget.size.width || 6} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')"><i class="mdi mdi-pencil"></i></button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')"><i class="mdi mdi-delete"></i></button>
                                                </div>
                                            </div>
                        <div id="chart-${widget.id}" style="height:200px;"></div>
                        <div class="d-flex justify-content-between text-muted small mt-1"><span>Y</span><span>X</span></div>
                        ${this.getWidgetStyleHint(widget.type)}
                                        </div>
                                    </div>
                                </div>
        `;
    }

    // --- 通用图表骨架（查看）
    renderChartSkeletonForView(widget) {
        return `
            <div class="col-md-${widget.size.width || 6} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                            </div>
                        <div id="chart-${widget.id}" style="height:200px;"></div>
                        <div class="d-flex justify-content-between text-muted small mt-1"><span>Y</span><span>X</span></div>
                        ${this.getWidgetStyleHint(widget.type)}
                                            </div>
                                        </div>
                                    </div>
        `;
    }

    // --- 表格骨架
    renderTableSkeletonEdit(widget) {
        return `
            <div class="col-md-${widget.size.width || 12} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')"><i class="mdi mdi-pencil"></i></button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')"><i class="mdi mdi-delete"></i></button>
                                </div>
                            </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead><tr><th>时间</th><th>名称</th><th>值</th></tr></thead>
                                <tbody><tr><td colspan="3" class="text-center text-muted">暂无数据</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTableSkeletonForView(widget) {
        return `
            <div class="col-md-${widget.size.width || 12} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead><tr><th>时间</th><th>名称</th><th>值</th></tr></thead>
                                <tbody><tr><td colspan="3" class="text-center text-muted">暂无数据</td></tr></tbody>
                            </table>
                                    </div>
                                </div>
                                        </div>
                                    </div>
        `;
    }

    // --- 日志骨架
    renderLogViewerEdit(widget) {
        return `
            <div class="col-md-${widget.size.width || 12} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')"><i class="mdi mdi-pencil"></i></button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')"><i class="mdi mdi-delete"></i></button>
                                        </div>
                                    </div>
                        <pre class="mb-0" style="background:#f8f9fa; height:200px; overflow:auto; padding:8px;">暂无日志</pre>
                                </div>
                                        </div>
                                    </div>
        `;
    }

    renderLogViewerForView(widget) {
        return `
            <div class="col-md-${widget.size.width || 12} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                </div>
                        <pre class="mb-0" style="background:#f8f9fa; height:200px; overflow:auto; padding:8px;">暂无日志</pre>
                                        </div>
                                    </div>
                                </div>
        `;
    }

    // 渲染指标卡片（编辑模式）
    renderMetricCard(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')">
                                    <i class="mdi mdi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')">
                                    <i class="mdi mdi-delete"></i>
                                </button>
                            </div>
                        </div>
                        <div class="text-center">
                            <h3 class="text-primary" id="metric-${widget.id}">--</h3>
                            <p class="text-muted small">数量</p>
                            ${this.getWidgetStyleHint(widget.type)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 渲染指标卡片（查看模式）
    renderMetricCardForView(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                        </div>
                        <div class="text-center">
                            <h3 class="text-primary" id="metric-${widget.id}">--</h3>
                            <p class="text-muted small">${widget.config.metric || '指标数据'}</p>
                                    </div>
                                </div>
                </div>
            </div>
        `;
    }

    // 渲染折线图（编辑模式）
    renderLineChart(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')">
                                    <i class="mdi mdi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')">
                                    <i class="mdi mdi-delete"></i>
                                </button>
                                        </div>
                                    </div>
                        <div id="chart-${widget.id}" style="height:200px;"></div>
                        ${this.getWidgetStyleHint(widget.type)}
                                </div>
                </div>
            </div>
        `;
    }
    
    // 渲染折线图（查看模式）
    renderLineChartForView(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                <div class="card">
                                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                        </div>
                        <div id="chart-${widget.id}" style="height:200px;"></div>
                        ${this.getWidgetStyleHint(widget.type)}
                                    </div>
                                </div>
                            </div>
        `;
    }

    // 渲染插件指标
    renderPluginMetrics(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0">${widget.title}</h6>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')">
                                    <i class="mdi mdi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')">
                                    <i class="mdi mdi-delete"></i>
                                </button>
                        </div>
                    </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <h6 class="text-muted">QPS</h6>
                                <h5 class="text-primary" id="qps-${widget.id}">--</h5>
                                </div>
                            <div class="col-4">
                                <h6 class="text-muted">延迟</h6>
                                <h5 class="text-success" id="latency-${widget.id}">--</h5>
                                        </div>
                            <div class="col-4">
                                <h6 class="text-muted">错误率</h6>
                                <h5 class="text-warning" id="error-rate-${widget.id}">--</h5>
                                    </div>
                                </div>
                            </div>
                </div>
            </div>
        `;
    }

    // 渲染插件指标（查看模式）
    renderPluginMetricsForView(widget) {
        return `
            <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                                                </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <h6 class="text-muted">QPS</h6>
                                <h5 class="text-primary" id="qps-${widget.id}">--</h5>
                                            </div>
                            <div class="col-4">
                                <h6 class="text-muted">延迟</h6>
                                <h5 class="text-success" id="latency-${widget.id}">--</h5>
                                        </div>
                            <div class="col-4">
                                <h6 class="text-muted">错误率</h6>
                                <h5 class="text-warning" id="error-rate-${widget.id}">--</h5>
                                    </div>
                                </div>
                                            </div>
                                            </div>
                                        </div>
        `;
    }
    
    // 渲染默认组件（编辑模式）
    renderDefaultWidget(widget) {
        const chartTypes = new Set(['line-chart','area-chart','bar-chart','stacked-bar','scatter-chart','histogram','pie-chart']);
        
        if (chartTypes.has(widget.type)) {
            // 图表类型：创建图表容器
            return `
                <div class="grid-stack-item" gs-w="${widget.size.width || 6}" gs-h="${widget.size.height || 2}" data-widget-id="${widget.id}" data-widget-type="${widget.type}">
                    <div class="grid-stack-item-content card">
                                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title mb-0">
                                    <i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>
                                    <span contenteditable="true" onblur="window.apisixAdmin.handleWidgetTitleEdit('${widget.id}', this)">${widget.title}</span>
                                </h6>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')">
                                        <i class="mdi mdi-pencil"></i>
                                    </button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')">
                                        <i class="mdi mdi-delete"></i>
                                    </button>
                                                </div>
                                            </div>
                            <div id="chart-${widget.id}" style="height:200px;"></div>
                            ${this.getWidgetStyleHint(widget.type)}
                                        </div>
                                    </div>
                                </div>
            `;
        } else {
            // 非图表类型：使用通用容器
            return `
                <div class="grid-stack-item" gs-w="${widget.size.width || 6}" gs-h="${widget.size.height || 2}" data-widget-id="${widget.id}" data-widget-type="${widget.type}">
                    <div class="grid-stack-item-content card">
                                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title mb-0">
                                    <i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>
                                    <span contenteditable="true" onblur="window.apisixAdmin.handleWidgetTitleEdit('${widget.id}', this)">${widget.title}</span>
                                </h6>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary btn-sm" onclick="window.apisixAdmin.editWidget('${widget.id}')">
                                        <i class="mdi mdi-pencil"></i>
                                    </button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="window.apisixAdmin.removeWidget('${widget.id}')">
                                        <i class="mdi mdi-delete"></i>
                                    </button>
                                            </div>
                                            </div>
                            <div class="text-center text-muted py-3" id="widget-edit-${widget.id}">加载中...</div>
                                        </div>
                                    </div>
                                </div>
            `;
        }
    }
    
    // 渲染默认组件（查看模式）
    renderDefaultWidgetForView(widget) {
        const chartTypes = new Set(['line-chart','area-chart','bar-chart','stacked-bar','scatter-chart','histogram','pie-chart']);
        
        if (chartTypes.has(widget.type)) {
            // 图表类型：创建图表容器
            return `
                <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            </div>
                            <div id="chart-${widget.id}" style="height:200px;"></div>
                            ${this.getWidgetStyleHint(widget.type)}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // 非图表类型：使用通用容器
            return `
                <div class="col-md-${widget.size.width} mb-3" data-widget-id="${widget.id}">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title mb-0"><i class="mdi ${this.getWidgetIconClass(widget.type)} mr-1"></i>${widget.title}</h6>
                            </div>
                            <div class="text-center text-muted py-3" id="widget-view-${widget.id}">加载中...</div>
                    </div>
                </div>
            </div>
        `;
        }
    }

    // 编辑组件
    editWidget(widgetId) {
        // 这里可以实现组件编辑功能
        this.showNotification('组件编辑功能开发中...', 'info');
    }
    
    // 删除组件
    removeWidget(widgetId) {
        this.showConfirm('确定要删除这个组件吗？', () => {
            const isDefaultEditing = !!document.getElementById('default-dashboard-edit');
            const editingCustomId = this.isEditingCustom;

            if (editingCustomId) {
                // 自定义仪表板编辑模式：仅从编辑容器中移除，不立刻写入存储
                const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
                if (widgetElement) widgetElement.remove();
                this.showNotification('组件已移除（未保存）', 'success');
                return;
            }

            if (isDefaultEditing) {
                // 默认仪表板编辑模式：仅从DOM移除，不刷新为只读
                const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
                if (widgetElement) widgetElement.remove();
                this.showNotification('组件已移除（未保存）', 'success');
                return;
            }

            // 非编辑模式下（查看态）删除：更新存储并刷新当前仪表板
            const dashboards = this.getAllDashboards();
            let changed = false;
            dashboards.forEach(dashboard => {
                if (dashboard.widgets) {
                    const before = dashboard.widgets.length;
                    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
                    if (dashboard.widgets.length !== before) changed = true;
                }
            });
            if (changed) localStorage.setItem('apisix_dashboards', JSON.stringify(dashboards));

            const currentDashboardId = document.getElementById('dashboard-selector')?.value || 'default';
            if (currentDashboardId === 'default') {
                this.showDefaultDashboard();
            } else {
                this.loadCustomDashboard(currentDashboardId);
            }
            this.showNotification('组件已删除', 'success');
        });
    }
    
    // 编辑仪表板
    editDashboard(dashboardId) {
        const dashboard = this.getDashboard(dashboardId);
        if (!dashboard) return;
        
        this.isEditingCustom = dashboardId;
        const newName = prompt('请输入仪表板名称:', dashboard.name);
        if (newName !== null && newName.trim() !== '') {
            dashboard.name = newName.trim();
        }
        
        const newDesc = prompt('请输入仪表板描述:', dashboard.description);
        if (newDesc !== null && newDesc.trim() !== '') {
            dashboard.description = newDesc.trim();
        }
        
        this.saveDashboard(dashboard);
        this.loadCustomDashboard(dashboardId);
        this.isEditingCustom = null;
        this.updateDashboardSelector();
        
        this.showNotification('仪表板信息已更新', 'success');
    }

    // 编辑当前仪表板
    editCurrentDashboard() {
        const currentDashboardId = document.getElementById('dashboard-selector')?.value || 'default';
        if (currentDashboardId === 'default') {
            // 默认仪表板也可以编辑，直接进入编辑模式
            this.editDefaultDashboard();
            return;
        }

        // 非默认：进入自定义仪表板的编辑模式（包含添加/保存/取消）
        this.editCustomDashboard(currentDashboardId);
    }
    
    // 编辑默认仪表板
    editDefaultDashboard() {
        // 显示编辑模式界面
        const contentDiv = document.getElementById('current-dashboard-content');
        if (!contentDiv) return;
        
        contentDiv.innerHTML = `
            <div class="dashboard-panel" id="default-dashboard-edit">
                <div class="row mb-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h4 class="card-title mb-1">编辑默认仪表板</h4>
                                        <p class="text-muted mb-0">您可以修改默认仪表板的组件和布局</p>
                                    </div>
                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.addWidgetToDefault()">
                                            <i class="mdi mdi-plus"></i> 添加组件
                                        </button>
                                        <button class="btn btn-outline-success" onclick="window.apisixAdmin.saveDefaultDashboard()">
                                            <i class="mdi mdi-check"></i> 保存更改
                                        </button>
                                        <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelDefaultEdit()">
                                            <i class="mdi mdi-close"></i> 取消编辑
                                        </button>
                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="grid-stack" id="default-widgets-container">
                    <!-- 仪表板组件容器 -->
                    ${this.loadDefaultWidgetsForEdit()}
                </div>
            </div>
        `;
        // 初始化 Gridstack（默认仪表板编辑）
        const gridEl = document.getElementById('default-widgets-container');
        if (gridEl && !gridEl.gridstack) {
            const grid = GridStack.init({
                cellHeight: 80,
                margin: 8,
                column: 12,
                resizable: { handles: 'e, se, s, sw, w' }
            }, gridEl);
            // 将已有子项标记为网格项
            grid.engine.nodes.forEach(() => {});
        }
        // 初始化已保存组件的模拟图表（编辑模式）
        const savedDefault = this.getDefaultDashboardFromStorage();
        if (savedDefault && savedDefault.widgets && savedDefault.widgets.length > 0) {
            setTimeout(() => {
                savedDefault.widgets.forEach(w => this.initWidget(w, 'edit'));
            }, 100);
        }
    }
    
    // 删除仪表板
    deleteDashboard(dashboardId) {
        this.showConfirm('确定要删除这个仪表板吗？此操作不可恢复！', () => {
            this.removeDashboard(dashboardId);
            this.updateDashboardSelector();
            this.showDefaultDashboard();
            this.showNotification('仪表板已删除', 'success');
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }
    
    // 已移除导入/导出功能

    // 添加插件监控组件
    addPluginWidget() {
        this.showNotification('正在跳转到插件监控配置...', 'info');
        // 这里可以跳转到插件管理页面
    }
    
    // 为默认仪表板添加组件 - 统一使用通用的添加组件方法
    addWidgetToDefault() {
        // 调用通用的添加组件方法，传入 'default' 作为仪表板ID
        this.addWidget('default');
    }
    
    // 保存默认仪表板的更改
    saveDefaultDashboard() {
        // 收集当前默认仪表板的所有组件
        const container = document.getElementById('default-widgets-container');
        if (!container) return;
        
        const widgets = [];
        const widgetElements = container.querySelectorAll('[data-widget-id]');
        
        widgetElements.forEach(element => {
            const widgetId = element.dataset.widgetId;
            const widgetType = element.dataset.widgetType;
            const widgetTitle = element.querySelector('.card-title')?.textContent.trim() || '未命名组件';
            // 读取 Gridstack 尺寸与位置
            const node = element.gridstackNode;
            const width = node?.w || 6;
            const height = node?.h || 2;
            const x = node?.x || 0;
            const y = node?.y || 0;
            
            // 从已渲染的组件中提取配置
            const widget = {
                id: widgetId,
                type: widgetType || 'default',
                title: widgetTitle,
                size: { width, height },
                position: { x, y },
                config: this.getWidgetDefaultConfig(widgetType || 'default')
            };
            
            widgets.push(widget);
        });
        
        // 保存到本地存储
        const defaultDashboard = {
            id: 'default',
            name: '默认仪表板',
            description: '系统默认仪表板',
            widgets: widgets,
            createdAt: new Date().toISOString(),
            isDefault: true
        };
        
        // 保存到本地存储
        this.saveDefaultDashboardToStorage(defaultDashboard);
        
        this.showNotification('默认仪表板更改已保存', 'success');
        this.showDefaultDashboard(); // 返回查看模式
        
        // 确保仪表板导航可以正常工作
        this.currentPage = 'dashboard';
    }
    
    // 保存默认仪表板到本地存储
    saveDefaultDashboardToStorage(dashboard) {
        const dashboards = this.getAllDashboards();
        const existingIndex = dashboards.findIndex(d => d.id === 'default');
        
        if (existingIndex >= 0) {
            dashboards[existingIndex] = dashboard;
        } else {
            dashboards.push(dashboard);
        }
        
        localStorage.setItem('apisix_dashboards', JSON.stringify(dashboards));
    }
    
    // 取消编辑默认仪表板
    cancelDefaultEdit() {
        this.showDefaultDashboard(); // 返回查看模式
        this.showNotification('编辑已取消', 'info');
        
        // 确保仪表板导航可以正常工作
        this.currentPage = 'dashboard';
    }
    
    // 编辑默认仪表板的组件
    editDefaultWidget(widgetId) {
        this.showNotification(`正在编辑组件: ${widgetId}`, 'info');
        // 这里可以实现组件编辑逻辑
    }
    
    // 删除默认仪表板的组件
    removeDefaultWidget(widgetId) {
        this.showConfirm('确定要删除这个组件吗？', () => {
            const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widgetElement) {
                widgetElement.remove();
                this.showNotification('组件已删除', 'success');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }
    
    // 在自定义仪表板编辑容器中追加组件
    addWidgetToCustomDashboard(dashboardId, widget) {
        const container = document.getElementById(`custom-widgets-container-${dashboardId}`);
        if (!container) return;

        // 如果是空状态提示，清空
        const emptyHint = container.querySelector('.text-center');
        if (emptyHint && emptyHint.textContent.includes('暂无数据组件')) {
            container.innerHTML = '';
        }

        container.insertAdjacentHTML('beforeend', this.renderDefaultWidget(widget));
        const gridEl = document.getElementById(`custom-widgets-container-${dashboardId}`);
        let grid = gridEl?.gridstack || GridStack.init({ cellHeight: 80, margin: 8, column: 12 }, gridEl);
        const newItem = gridEl?.lastElementChild;
        if (grid && newItem) {
            try { grid.addWidget(newItem); } catch (e) { try { grid.makeWidget(newItem); } catch (_) {} }
        }
    }

    // 保存自定义仪表板（编辑模式）
    saveCustomDashboard(dashboardId) {
        const container = document.getElementById(`custom-widgets-container-${dashboardId}`);
        if (!container) return;

        const widgets = [];
        const widgetElements = container.querySelectorAll('[data-widget-id]');
        widgetElements.forEach(element => {
            const widgetId = element.dataset.widgetId;
            const widgetType = element.dataset.widgetType;
            const widgetTitle = element.querySelector('.card-title')?.textContent.trim() || '未命名组件';
            const node = element.gridstackNode;
            const width = node?.w || 6;
            const height = node?.h || 2;
            const x = node?.x || 0;
            const y = node?.y || 0;
            widgets.push({
                id: widgetId,
                type: widgetType || 'default',
                title: widgetTitle,
                size: { width, height },
                position: { x, y },
                config: this.getWidgetDefaultConfig(widgetType || 'default')
            });
        });

        const dashboard = this.getDashboard(dashboardId);
        if (!dashboard) return;
        dashboard.widgets = widgets;
        // 读取名称与描述
        const nameInput = document.getElementById(`dashboard-name-input-${dashboardId}`);
        const descInput = document.getElementById(`dashboard-desc-input-${dashboardId}`);
        if (nameInput && nameInput.value.trim() !== '') dashboard.name = nameInput.value.trim();
        dashboard.description = descInput ? (descInput.value || '') : dashboard.description;

        try {
            this.saveDashboard(dashboard);
            this.isEditingCustom = null;
            this.showNotification('仪表板更改已保存', 'success');
            this.loadCustomDashboard(dashboardId);
        } catch (e) {
            console.error(e);
            this.showNotification('保存失败，请重试', 'danger');
        }
    }

    // 处理组件标题内联编辑（编辑模式）
    handleWidgetTitleEdit(widgetId, el) {
        const newTitle = (el.textContent || '').trim();
        if (!newTitle) {
            el.textContent = '未命名组件';
        }
    }

    // 取消编辑自定义仪表板
    cancelCustomEdit(dashboardId) {
        this.isEditingCustom = null;
        this.loadCustomDashboard(dashboardId);
        this.showNotification('编辑已取消', 'info');
    }

    // 编辑自定义仪表板
    editCustomDashboard(dashboardId) {
        const dashboard = this.getDashboard(dashboardId);
        if (!dashboard) return;

        this.isEditingCustom = dashboardId;

        const contentDiv = document.getElementById('current-dashboard-content');
        if (!contentDiv) return;

        contentDiv.innerHTML = `
            <div class="dashboard-panel" id="custom-dashboard-edit-${dashboardId}">
                <div class="row mb-3">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="w-50 pr-3">
                                        <div class="form-inline w-100">
                                            <input type="text" class="form-control form-control-sm flex-grow-1" id="dashboard-name-input-${dashboardId}" value="${dashboard.name}" placeholder="仪表板名称">
                                        </div>
                                        <input type="text" class="form-control form-control-sm mt-2" id="dashboard-desc-input-${dashboardId}" value="${dashboard.description || ''}" placeholder="描述（可选）">
                                    </div>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.addWidget('${dashboardId}')">
                                            <i class="mdi mdi-plus"></i> 添加组件
            </button>
                                        <button class="btn btn-outline-success" onclick="window.apisixAdmin.saveCustomDashboard('${dashboardId}')">
                                            <i class="mdi mdi-check"></i> 保存更改
                                        </button>
                                        <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.cancelCustomEdit('${dashboardId}')">
                                            <i class="mdi mdi-close"></i> 取消编辑
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid-stack" id="custom-widgets-container-${dashboardId}">
                    ${dashboard.widgets && dashboard.widgets.length > 0 ? dashboard.widgets.map(w => this.renderDefaultWidget(w)).join('') : `
                        <div class=\"col-12\"> 
                            <div class=\"card\"> 
                                <div class=\"card-body text-center py-4\"> 
                                    <i class=\"mdi mdi-chart-line mdi-36px text-muted\"></i> 
                                    <p class=\"text-muted mb-0\">暂无数据组件，点击上方"添加组件"开始构建</p> 
                                </div> 
                            </div> 
                        </div>`}
                </div>
            </div>
        `;
        // 初始化已有组件（编辑模式预览）
        if (dashboard.widgets && dashboard.widgets.length > 0) {
            setTimeout(() => {
                dashboard.widgets.forEach(w => this.initWidget(w, 'edit'));
            }, 100);
        }
        // 初始化 Gridstack（自定义仪表板编辑）
        const gridEl = document.getElementById(`custom-widgets-container-${dashboardId}`);
        if (gridEl && !gridEl.gridstack) {
            GridStack.init({ cellHeight: 80, margin: 8, column: 12, resizable: { handles: 'e, se, s, sw, w' } }, gridEl);
        }
    }
    
    // ==================== 数据存储管理 ====================
    
    // 保存仪表板
    saveDashboard(dashboard) {
        const dashboards = this.getAllDashboards();
        const existingIndex = dashboards.findIndex(d => d.id === dashboard.id);
        
        if (existingIndex >= 0) {
            dashboards[existingIndex] = dashboard;
        } else {
            dashboards.push(dashboard);
        }
        
        localStorage.setItem('apisix_dashboards', JSON.stringify(dashboards));
    }
    
    // 获取仪表板
    getDashboard(dashboardId) {
        const dashboards = this.getAllDashboards();
        return dashboards.find(d => d.id === dashboardId);
    }
    
    // 获取所有仪表板
    getAllDashboards() {
        const stored = localStorage.getItem('apisix_dashboards');
        return stored ? JSON.parse(stored) : [];
    }
    
    // 删除仪表板
    removeDashboard(dashboardId) {
        const dashboards = this.getAllDashboards();
        const filtered = dashboards.filter(d => d.id !== dashboardId);
        localStorage.setItem('apisix_dashboards', JSON.stringify(filtered));
    }
    
    // 更新仪表板选择器
    updateDashboardSelector() {
        const selector = document.getElementById('dashboard-selector');
        if (!selector) return;
        
        const dashboards = this.getAllDashboards();
        const currentValue = selector.value;
        
        // 清空现有选项（保留默认选项）
        selector.innerHTML = '<option value="default">默认仪表板</option>';
        
        // 添加自定义仪表板（忽略默认仪表板，避免出现两个"默认仪表板"选项）
        dashboards
            .filter(dashboard => dashboard.id !== 'default')
            .forEach(dashboard => {
            const option = document.createElement('option');
            option.value = dashboard.id;
            option.textContent = dashboard.name;
            selector.appendChild(option);
        });
        
        // 恢复选择状态
        if (currentValue) {
            selector.value = currentValue;
        }
    }
    
    // ==================== 路由管理功能 ====================
    
    // 初始化路由管理
    initRoutesManagement() {
        this.initRoutesData();
        this.bindRoutesEvents();
        this.updateRoutesStats();
    }
    
    // 绑定路由管理事件
    bindRoutesEvents() {
        // 搜索功能
        const searchInput = document.getElementById('route-search');
        console.log('搜索输入框元素:', searchInput);
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                console.log('搜索输入事件触发:', e.target.value);
                this.filterRoutes(e.target.value);
            });
            console.log('搜索事件绑定成功');
        } else {
            console.log('搜索输入框未找到');
        }
        

        
        // HTTP方法标签交互
        this.bindHttpMethodSelect();
        
        // 排序功能
        this.bindRoutesSorting();
        
        // 加载服务选项
        this.loadServiceOptions();
    }
    
    // 绑定HTTP方法下拉选择事件
    bindHttpMethodSelect() {
        const select = document.getElementById('http-method-select');
        if (select) {
            select.addEventListener('change', (e) => {
                const selectedValue = e.target.value;
                if (selectedValue) {
                    this.addHttpMethodTag(selectedValue);
                    e.target.value = ''; // 重置选择
                }
            });
        }
    }
    
    // 添加HTTP方法标签
    addHttpMethodTag(method) {
        const tagsContainer = document.getElementById('selected-methods-tags');
        const existingTags = tagsContainer.querySelectorAll('.http-method-tag');
        
        // 检查是否已经存在
        for (let tag of existingTags) {
            if (tag.getAttribute('data-method') === method) {
                return; // 已存在，不重复添加
            }
        }
        
        // 创建新标签
        const tag = document.createElement('div');
        tag.className = 'http-method-tag';
        tag.setAttribute('data-method', method);
        tag.innerHTML = `
            ${method}
            <span class="remove-btn" onclick="this.parentElement.remove()">&times;</span>
        `;
        
        tagsContainer.appendChild(tag);
    }
    
    // 移除HTTP方法标签
    removeHttpMethodTag(method) {
        const tag = document.querySelector(`.http-method-tag[data-method="${method}"]`);
        if (tag) {
            tag.remove();
        }
    }
    
    // 重置HTTP方法标签
    resetHttpMethodTags() {
        const tagsContainer = document.getElementById('selected-methods-tags');
        if (tagsContainer) {
            tagsContainer.innerHTML = '';
        }
        
        // 默认添加GET方法
        this.addHttpMethodTag('GET');
    }
    
    // 设置HTTP方法标签
    setHttpMethodTags(methods) {
        const tagsContainer = document.getElementById('selected-methods-tags');
        if (tagsContainer) {
            tagsContainer.innerHTML = '';
        }
        
        methods.forEach(method => {
            this.addHttpMethodTag(method);
        });
    }
    
    // 获取选中的HTTP方法
    getSelectedHttpMethods() {
        const selectedMethods = [];
        const methodTags = document.querySelectorAll('.http-method-tag');
        methodTags.forEach(tag => {
            const method = tag.getAttribute('data-method');
            if (method && method.trim() !== '') {
                selectedMethods.push(method);
            }
        });
        
        // 如果没有选择任何方法，默认返回GET
        if (selectedMethods.length === 0) {
            console.log('没有选择HTTP方法，使用默认GET方法');
            return ['GET'];
        }
        
        console.log('选中的HTTP方法:', selectedMethods);
        return selectedMethods;
    }
    
    // 加载服务选项
    loadServiceOptions() {
        const serviceSelect = document.getElementById('route-service');
        if (!serviceSelect) {
            console.log('服务选择器不存在');
            return;
        }
        
        if (!this.servicesData || this.servicesData.length === 0) {
            console.log('服务数据为空，尝试从本地存储加载');
            // 尝试从本地存储加载服务数据
            const storedServices = localStorage.getItem('services');
            if (storedServices) {
                this.servicesData = JSON.parse(storedServices);
                console.log('从本地存储加载的服务数据:', this.servicesData);
            } else {
                console.log('本地存储中也没有服务数据');
                serviceSelect.innerHTML = '<option value="">暂无可用服务</option>';
                return;
            }
        }
        
        // 保存当前选中的值
        const currentValue = serviceSelect.value;
        
        // 清空现有选项
        serviceSelect.innerHTML = '<option value="">请选择服务</option>';
        
        // 添加服务选项
        this.servicesData.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = `${service.name} (${service.id})`;
            serviceSelect.appendChild(option);
        });
        
        // 恢复选中的值
        if (currentValue) {
            serviceSelect.value = currentValue;
        }
        
        console.log('服务选项加载完成，共', this.servicesData.length, '个服务');
    }
    

    
    // 路由插件管理
    currentRoutePlugins = [];
    
    // 显示路由插件选择器
    showRoutePluginSelector() {
        this.showPluginSelector('route', null, (selectedPlugins) => {
            this.updateRoutePluginSelection(selectedPlugins);
        });
    }
    
    // 更新路由插件选择
    updateRoutePluginSelection(selectedPlugins) {
        if (!selectedPlugins || selectedPlugins.length === 0) {
            // 清空选择
            document.getElementById('selected-route-plugins').innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="mdi mdi-information-outline me-1"></i>
                    点击"选择插件"按钮为路由添加插件配置
                    <br><small class="text-muted">路由级别的插件配置具有最高优先级，会覆盖服务级别的同名插件</small>
                </div>
            `;
            document.getElementById('route-plugin-configs').classList.add('d-none');
            return;
        }
        
        // 显示已选择的插件
        const pluginsHtml = selectedPlugins.map(plugin => `
            <div class="alert alert-info alert-dismissible fade show mb-2" role="alert">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">
                            <i class="mdi mdi-puzzle me-2"></i>${plugin.plugin_name}
                        </h6>
                        <p class="mb-1 small">${plugin.name || '默认配置'}</p>
                        <small class="text-muted">
                            创建时间: ${new Date(plugin.created_at).toLocaleString()}
                        </small>
                    </div>
                    <button type="button" class="btn-close" onclick="window.apisixAdmin.removeRoutePlugin('${plugin.id}')"></button>
                </div>
            </div>
        `).join('');
        
        document.getElementById('selected-route-plugins').innerHTML = pluginsHtml;
        
        // 显示插件配置详情
        this.updateRoutePluginConfigs(selectedPlugins);
        document.getElementById('route-plugin-configs').classList.remove('d-none');
    }
    
    // 更新路由插件配置详情
    updateRoutePluginConfigs(selectedPlugins) {
        const configList = document.getElementById('route-plugin-config-list');
        if (!configList) return;
        
        const configsHtml = selectedPlugins.map(plugin => {
            // 生成配置详情提示
            let configTips = '';
            let configSummary = '';
            
            // 检查配置是否为空或只有note字段
            const hasValidConfig = plugin.config && 
                Object.keys(plugin.config).length > 0 && 
                !(Object.keys(plugin.config).length === 1 && plugin.config.note !== undefined);
            
            if (plugin.plugin_name === 'consumer-restriction') {
                if (plugin.config.whitelist && plugin.config.whitelist.length > 0) {
                    configTips = `
                        <div class="alert alert-warning mt-2">
                            <i class="mdi mdi-account-group me-2"></i>
                            <strong>消费者白名单:</strong> <code>${plugin.config.whitelist.join(', ')}</code>
                            <br><small class="text-muted">只有白名单中的消费者可以访问此路由</small>
                        </div>
                    `;
                } else {
                    configTips = `
                        <div class="alert alert-info mt-2">
                            <i class="mdi mdi-information-outline me-2"></i>
                            <strong>消费者限制插件</strong>
                            <br><small class="text-muted">请配置白名单或黑名单来限制消费者访问</small>
                        </div>
                    `;
                }
            } else if (plugin.plugin_name === 'cors') {
                if (plugin.config.allow_origins) {
                    configTips = `
                        <div class="alert alert-info mt-2">
                            <i class="mdi mdi-web me-2"></i>
                            <strong>CORS配置:</strong>
                            <br><strong>允许Origin:</strong> <code>${plugin.config.allow_origins}</code>
                            <br><strong>允许方法:</strong> <code>${plugin.config.allow_methods || 'GET,POST,PUT,DELETE,OPTIONS'}</code>
                            <br><small class="text-muted">跨域资源共享配置</small>
                        </div>
                    `;
                }
            } else if (plugin.plugin_name === 'ip-restriction' && plugin.config.whitelist) {
                configTips = `
                    <div class="alert alert-info mt-2">
                        <i class="mdi mdi-ip-network me-2"></i>
                        <strong>IP白名单:</strong> <code>${plugin.config.whitelist.join(', ')}</code>
                        <br><small class="text-muted">只有白名单中的IP可以访问此路由</small>
                    </div>
                `;
            } else if (plugin.plugin_name === 'rate-limiting' && plugin.config.rate) {
                configTips = `
                    <div class="alert alert-success mt-2">
                        <i class="mdi mdi-speedometer me-2"></i>
                        <strong>限流配置:</strong>
                        <br><strong>速率:</strong> <code>${plugin.config.rate}</code> 请求/分钟
                        <br><strong>突发:</strong> <code>${plugin.config.burst || '无'}</code>
                        <br><small class="text-muted">限制访问此路由的请求频率</small>
                    </div>
                `;
            } else if (plugin.plugin_name === 'proxy-rewrite' && plugin.config.uri) {
                configTips = `
                    <div class="alert alert-primary mt-2">
                        <i class="mdi mdi-rewind me-2"></i>
                        <strong>代理重写:</strong> <code>${plugin.config.uri}</code>
                        <br><small class="text-muted">重写请求URI路径</small>
                    </div>
                `;
            }
            
            // 如果配置为空或无效，显示提示
            if (!hasValidConfig) {
                configSummary = `
                    <div class="alert alert-warning">
                        <i class="mdi mdi-alert-circle me-2"></i>
                        <strong>配置模板为空</strong>
                        <br><small class="text-muted">请在插件管理中为 ${plugin.plugin_name} 创建配置模板</small>
                    </div>
                `;
            }
            
            return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="mdi mdi-cog me-2"></i>${plugin.plugin_name} 配置
                    </h6>
                    <div>
                        <button class="btn btn-outline-success btn-sm me-2" type="button" onclick="window.apisixAdmin.toggleRoutePluginConfigEdit('${plugin.id}')">
                            <i class="mdi mdi-pencil me-1"></i>编辑配置
                        </button>
                        <button class="btn btn-primary btn-sm" type="button" onclick="window.apisixAdmin.saveRoutePluginConfigDirect('${plugin.id}')" style="display: none;" id="save-route-btn-${plugin.id}">
                            <i class="mdi mdi-content-save me-1"></i>保存
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${configSummary}
                    <div class="mb-2">
                        <textarea class="form-control" id="route-config-${plugin.id}" rows="6" style="font-family: monospace; font-size: 11px; width: 100%;" readonly>${JSON.stringify(plugin.config, null, 2)}</textarea>
                    </div>
                    ${configTips}
                </div>
            </div>
            `;
        }).join('');
        
        configList.innerHTML = configsHtml;
    }
    
    // 移除路由插件
    removeRoutePlugin(pluginId) {
        this.currentRoutePlugins = this.currentRoutePlugins.filter(p => p.id !== pluginId);
        this.updateRoutePluginSelection(this.currentRoutePlugins);
        this.showNotification('插件已移除', 'success');
    }
    
    // 切换路由插件配置编辑模式
    toggleRoutePluginConfigEdit(pluginId) {
        const textarea = document.getElementById(`route-config-${pluginId}`);
        const editBtn = document.querySelector(`button[onclick*="toggleRoutePluginConfigEdit('${pluginId}')"]`);
        const saveBtn = document.getElementById(`save-route-btn-${pluginId}`);
        
        if (!textarea || !editBtn || !saveBtn) return;
        
        if (textarea.readOnly) {
            // 进入编辑模式
            textarea.readOnly = false;
            textarea.style.backgroundColor = '#fff';
            textarea.style.borderColor = '#28a745';
            editBtn.style.display = 'none';
            saveBtn.style.display = 'inline-block';
            editBtn.innerHTML = '<i class="mdi mdi-eye me-1"></i>查看配置';
        } else {
            // 退出编辑模式
            textarea.readOnly = true;
            textarea.style.backgroundColor = '#f8f9fa';
            textarea.style.borderColor = '#dee2e6';
            editBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            editBtn.innerHTML = '<i class="mdi mdi-pencil me-1"></i>编辑配置';
        }
    }
    
    // 直接保存路由插件配置
    saveRoutePluginConfigDirect(pluginId) {
        const textarea = document.getElementById(`route-config-${pluginId}`);
        if (!textarea) return;
        
        try {
            const newConfig = JSON.parse(textarea.value);
            const pluginIndex = this.currentRoutePlugins.findIndex(p => p.id === pluginId);
            
            if (pluginIndex >= 0) {
                this.currentRoutePlugins[pluginIndex].config = newConfig;
                this.updateRoutePluginSelection(this.currentRoutePlugins);
                this.showNotification('路由插件配置已保存', 'success');
            }
        } catch (error) {
            this.showNotification('配置格式错误，请检查JSON格式', 'error');
        }
    }
    
    // 从APISIX加载路由插件配置
    loadRoutePluginsFromAPISIX(plugins) {
        console.log('=== 加载路由插件配置 ===');
        console.log('原始插件数据:', plugins);
        
        this.currentRoutePlugins = [];
        
        if (plugins && typeof plugins === 'object' && Object.keys(plugins).length > 0) {
            Object.keys(plugins).forEach(pluginName => {
                const pluginConfig = plugins[pluginName];
                console.log(`处理插件 ${pluginName}:`, pluginConfig);
                
                // 查找插件模板信息
                const pluginTemplate = this.allPlugins.find(p => p.plugin_name === pluginName);
                console.log(`插件模板信息:`, pluginTemplate);
                
                if (pluginTemplate) {
                    const routePlugin = {
                        id: `route-${pluginName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        plugin_name: pluginName,
                        name: pluginTemplate.title || pluginName,
                        config: pluginConfig,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    console.log(`创建的路由插件对象:`, routePlugin);
                    this.currentRoutePlugins.push(routePlugin);
                } else {
                    console.warn(`未找到插件 ${pluginName} 的模板信息`);
                }
            });
        } else {
            console.log('没有插件配置或插件配置为空');
        }
        
        console.log('最终的路由插件数组:', this.currentRoutePlugins);
        this.updateRoutePluginSelection(this.currentRoutePlugins);
    }
    
    // 获取路由插件显示
    getRoutePluginsDisplay(route) {
        if (!route.plugins || typeof route.plugins !== 'object' || Object.keys(route.plugins).length === 0) {
            return '<span class="text-muted">无插件</span>';
        }
        
        const pluginNames = Object.keys(route.plugins);
        const pluginBadges = pluginNames.map(pluginName => {
            const pluginTemplate = this.allPlugins.find(p => p.plugin_name === pluginName);
            const title = pluginTemplate ? pluginTemplate.title : pluginName;
            
            return `<span class="badge bg-primary me-1" title="${pluginName}">${title}</span>`;
        }).join('');
        
        return pluginBadges;
    }
    
    // 绑定路由排序功能
    bindRoutesSorting() {
        const sortableHeaders = document.querySelectorAll('#routes-table .sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                this.sortRoutes(sortField);
            });
        });
    }
    
    // 排序路由
    sortRoutes(sortField) {
        // 切换排序方向
        if (this.currentSortField === sortField) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = sortField;
            this.currentSortDirection = 'asc';
        }
        
        // 更新排序图标
        this.updateSortIcons('routes-table', sortField, this.currentSortDirection);
        
        // 排序数据
        const sortedData = [...this.routesData].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // 特殊处理某些字段
            if (sortField === 'methods') {
                aValue = a.methods ? a.methods.length : 0;
                bValue = b.methods ? b.methods.length : 0;
            } else if (sortField === 'createTime') {
                aValue = new Date(a.createTime);
                bValue = new Date(b.createTime);
            }
            
            // 字符串比较
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (this.currentSortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });
        
        // 重新显示排序后的数据
        this.currentPage = 1;
        this.displayRoutesWithPagination(sortedData);
    }
    
    // 初始化路由数据
    initRoutesData() {
        // 如果还没有数据，则初始化为空数组
        if (!this.routesData || this.routesData.length === 0) {
            this.routesData = [];
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displayRoutesWithPagination(this.routesData);
        this.updateRoutesStats();
    }
    
    // 显示路由列表（带分页）
    displayRoutesWithPagination(routes) {
        const tbody = document.getElementById('routes-tbody');
        if (!tbody) return;
        
        // 安全检查：确保routes是有效的数组
        if (!routes || !Array.isArray(routes)) {
            console.warn('displayRoutesWithPagination: routes参数无效:', routes);
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        <i class="mdi mdi-routes mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无路由数据</p>
                    </td>
                </tr>
            `;
            this.updatePagination(0);
            return;
        }
        
        if (routes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        <i class="mdi mdi-routes mdi-24px"></i>
                        <p class="mt-2 mb-0">暂无路由数据</p>
                    </td>
                </tr>
            `;
            this.updatePagination(0);
            return;
        }
        
        // 计算分页
        const totalPages = Math.ceil(routes.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, routes.length);
        const currentPageRoutes = routes.slice(startIndex, endIndex);
        
        // 渲染当前页数据
        tbody.innerHTML = currentPageRoutes.map(route => `
            <tr>
                <td><code>${route.id || '未知'}</code></td>
                <td>
                    <div>
                        <strong>${route.name || '未命名'}</strong>
                        ${(route.description ? `<br><small class="text-muted">${route.description}</small>` : '')}
                    </div>
                </td>
                <td><code>${route.uri || ''}</code></td>
                <td>
                    ${(route.methods && Array.isArray(route.methods) ? route.methods.map(method => `<span class="badge bg-light text-dark me-1">${method}</span>`).join('') : '<span class="text-muted">无</span>')}
                </td>
                <td>
                    <span class="badge bg-info">${route.service || '无'}</span>
                </td>
                <td>
                    ${this.getRoutePluginsDisplay(route)}
                </td>
                <td>
                    <span class="badge ${(route.status === 'enabled' ? 'bg-success' : 'bg-warning')}">
                        ${(route.status === 'enabled' ? '已启用' : '已禁用')}
                    </span>
                </td>
                <td>${route.createTime || '未知'}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="window.apisixAdmin.editRoute('${route.id || ''}')" title="编辑">
                            <i class="mdi mdi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-secondary" onclick="window.apisixAdmin.viewRoute('${route.id || ''}')" title="查看">
                            <i class="mdi mdi-eye"></i>
                        </button>
                        <button class="btn btn-outline-${(route.status === 'enabled' ? 'warning' : 'success')}" 
                                onclick="window.apisixAdmin.toggleRouteStatus('${route.id || ''}')" 
                                title="${(route.status === 'enabled' ? '禁用' : '启用')}">
                            <i class="mdi mdi-${(route.status === 'enabled' ? 'pause' : 'play')}"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="window.apisixAdmin.deleteRoute('${route.id || ''}')" title="删除">
                            <i class="mdi mdi-delete"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        // 更新分页信息
        this.updatePagination(routes.length, totalPages, startIndex + 1, endIndex);
    }
    
    // 更新分页信息
    updatePagination(totalItems, totalPages, startItem, endItem) {
        // 参数安全检查
        totalItems = totalItems || 0;
        totalPages = totalPages || 0;
        startItem = startItem || 0;
        endItem = endItem || 0;
        
        // 更新分页信息显示
        const startElement = document.getElementById('routes-start');
        const endElement = document.getElementById('routes-end');
        const totalElement = document.getElementById('routes-total');
        
        if (startElement) startElement.textContent = startItem;
        if (endElement) endElement.textContent = endItem;
        if (totalElement) totalElement.textContent = totalItems;
        
        // 生成分页按钮
        const paginationContainer = document.getElementById('routes-pagination');
        if (!paginationContainer) return;
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }
        
        let paginationHTML = '';
        
        // 上一页按钮
        paginationHTML += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToPage(${this.currentPage - 1})">
                    <i class="mdi mdi-chevron-left"></i>
                </a>
            </li>
        `;
        
        // 页码按钮
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // 第一页
        if (startPage > 1) {
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToPage(1)">1</a>
                </li>
            `;
            if (startPage > 2) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        
        // 中间页码
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToPage(${i})">${i}</a>
                </li>
            `;
        }
        
        // 最后一页
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHTML += `
                <li class="page-item">
                    <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToPage(${totalPages})">${totalPages}</a>
                </li>
            `;
        }
        
        // 下一页按钮
        paginationHTML += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="window.apisixAdmin.goToPage(${this.currentPage + 1})">
                    <i class="mdi mdi-chevron-right"></i>
                </a>
            </li>
        `;
        
        paginationContainer.innerHTML = paginationHTML;
    }
    
    // 跳转到指定页面
    goToPage(page) {
        if (page < 1 || page > Math.ceil(this.routesData.length / this.pageSize)) return;
        this.currentPage = page;
        this.displayRoutesWithPagination(this.routesData);
    }
    
    // 显示路由列表（保持向后兼容）
    displayRoutes(routes) {
        this.displayRoutesWithPagination(routes);
    }
    
    // 更新路由统计
    updateRoutesStats() {
        // 安全检查
        if (!this.routesData || !Array.isArray(this.routesData)) {
            console.warn('updateRoutesStats: routesData无效');
            return;
        }
        
        const totalRoutes = this.routesData.length;
        const enabledRoutes = this.routesData.filter(r => r.status === 'enabled').length;
        const disabledRoutes = this.routesData.filter(r => r.status === 'disabled').length;
        
        console.log('=== 路由统计信息 ===');
        console.log('总路由数:', totalRoutes);
        console.log('已启用数:', enabledRoutes);
        console.log('已禁用数:', disabledRoutes);
        console.log('路由数据:', this.routesData.map(r => ({ id: r.id, name: r.name, status: r.status, methods: r.methods })));
        
        // 计算所有路由的插件总数
        let totalPlugins = 0;
        this.routesData.forEach(route => {
            if (route.plugins && typeof route.plugins === 'object') {
                totalPlugins += Object.keys(route.plugins).length;
            }
        });
        
        const totalElement = document.getElementById('total-routes');
        const enabledElement = document.getElementById('enabled-routes');
        const disabledElement = document.getElementById('disabled-routes');
        const pluginsElement = document.getElementById('total-plugins');
        
        if (totalElement) totalElement.textContent = totalRoutes;
        if (enabledElement) enabledElement.textContent = enabledRoutes;
        if (disabledElement) disabledElement.textContent = disabledRoutes;
        if (pluginsElement) pluginsElement.textContent = totalPlugins;
    }
    
    // 搜索路由
    filterRoutes(searchTerm) {
        console.log('搜索关键词:', searchTerm);
        console.log('当前路由数据数量:', this.routesData?.length || 0);
        
        // 安全检查：确保routesData存在且是数组
        if (!this.routesData || !Array.isArray(this.routesData)) {
            console.warn('filterRoutes: routesData无效，初始化为空数组');
            this.routesData = [];
        }
        
        if (!searchTerm) {
            this.currentPage = 1;
            this.displayRoutesWithPagination(this.routesData);
            console.log('搜索为空，显示所有路由');
            return;
        }
        
        const filtered = this.routesData.filter(route => 
            route.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            route.uri?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            route.service?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        console.log('搜索结果数量:', filtered.length);
        console.log('搜索结果:', filtered.map(r => r.name));
        
        this.currentPage = 1;
        this.displayRoutesWithPagination(filtered);
    }
    

    

    
    // 初始化路由数据
    async initializeRoutesData() {
        console.log('=== 初始化路由数据 ===');
        
        // 如果还没有数据，则初始化为空数组
        if (!this.routesData || this.routesData.length === 0) {
            this.routesData = [];
            // 数据为空时自动刷新
            console.log('路由数据为空，自动刷新...');
            setTimeout(() => {
                this.refreshRoutes();
            }, 200);
        }
        
        this.currentPage = 1;
        this.pageSize = 50;
        this.displayRoutesWithPagination(this.routesData);
        this.updateRoutesStats();
    }
    
    // 刷新路由
    async refreshRoutes() {
        try {
            this.showNotification('正在从APISIX获取路由数据...', 'info');
            
            // 从APISIX获取最新路由数据
            const apisixRoutes = await this.getRoutes();
            
            if (apisixRoutes && Array.isArray(apisixRoutes)) {
                // 转换APISIX数据格式为管理界面格式
                this.routesData = apisixRoutes.map(route => {
                    const routeData = route.value || route;
                    console.log('转换路由数据:', { original: route, routeData });
                    
                    // 解析路由ID
                    let routeId = routeData.id;
                    if (!routeId && route.key) {
                        routeId = route.key.replace('/apisix/routes/', '');
                    }
                    
                    // 解析状态
                    let status = 'disabled';
                    if (routeData.status === 1 || routeData.status === 'enabled') {
                        status = 'enabled';
                    }
                    
                    // 解析HTTP方法
                    let methods = ['GET'];
                    if (routeData.methods && Array.isArray(routeData.methods)) {
                        methods = routeData.methods;
                    }
                    
                    // 解析服务ID
                    let serviceId = '';
                    if (routeData.service_id) {
                        serviceId = routeData.service_id;
                    } else if (routeData.service && routeData.service.id) {
                        serviceId = routeData.service.id;
                    }
                    
                    const convertedRoute = {
                        id: routeId || 'unknown',
                        name: routeData.name || `路由-${routeId}`,
                        uri: routeData.uri || '',
                        methods: methods,
                        service: serviceId,
                        priority: routeData.priority || 0,
                        description: routeData.desc || routeData.description || '',
                        status: status,
                        createTime: routeData.create_time ? new Date(routeData.create_time * 1000).toLocaleString() : '',
                        updateTime: routeData.update_time ? new Date(routeData.update_time * 1000).toLocaleString() : '',
                        plugins: routeData.plugins || {}
                    };
                    
                    console.log('转换后的路由数据:', convertedRoute);
                    return convertedRoute;
                });
                
                // 保存到localStorage
                this.saveToStorage('routes', this.routesData);
                
                // 更新界面
            this.currentPage = 1;
            this.updateRoutesStats();
                this.displayRoutesWithPagination(this.routesData);
                
                this.showNotification(`成功获取 ${this.routesData.length} 条路由数据`, 'success');
            } else {
                this.showNotification('获取路由数据失败', 'error');
            }
        } catch (error) {
            console.error('刷新路由失败:', error);
            this.showNotification('刷新路由失败: ' + error.message, 'error');
        }
    }
    
    // 创建路由
    createRoute() {
        document.getElementById('routeModalLabel').innerHTML = '<i class="mdi mdi-plus-circle me-2"></i>新建路由';
        document.getElementById('route-form').reset();
        document.getElementById('route-id').value = '';
        document.getElementById('route-id').disabled = false;
        
        // 设置默认值
        document.getElementById('route-enabled').checked = true;
        
        // 设置HTTP方法默认值
        this.resetHttpMethodTags();
        
        // 初始化路由插件配置
        this.currentRoutePlugins = [];
        this.updateRoutePluginSelection(this.currentRoutePlugins);
        
        // 加载服务选项
        this.loadServiceOptions();
        
        const modal = new bootstrap.Modal(document.getElementById('routeModal'));
        modal.show();
        
        // 重新绑定HTTP方法下拉选择事件
        setTimeout(() => {
            this.bindHttpMethodSelect();
        }, 100);
    }
    
    // 取消路由操作
    cancelRoute() {
        const modalElement = document.getElementById('routeModal');
        if (modalElement) {
            // 直接操作DOM关闭模态框
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
        }
        this.showNotification('操作已取消', 'info');
    }
    
    // 编辑路由
    editRoute(routeId) {
        console.log('=== 开始编辑路由 ===');
        console.log('路由ID:', routeId);
        
        const route = this.routesData.find(r => r.id === routeId);
        if (!route) {
            this.showNotification('路由不存在', 'error');
            return;
        }
        
        console.log('找到的路由数据:', route);
        console.log('路由插件数据:', route.plugins);
        console.log('插件数据类型:', typeof route.plugins);
        console.log('插件数据键:', route.plugins ? Object.keys(route.plugins) : '无插件');
        
        document.getElementById('routeModalLabel').innerHTML = '<i class="mdi mdi-pencil me-2"></i>编辑路由';
        document.getElementById('route-id').value = route.id;
        document.getElementById('route-id').disabled = true;
        document.getElementById('route-name').value = route.name;
        document.getElementById('route-uri').value = route.uri;
        document.getElementById('route-service').value = route.service;
        document.getElementById('route-priority').value = route.priority;
        document.getElementById('route-desc').value = route.description || '';
        document.getElementById('route-enabled').checked = route.status === 'enabled';
        
        // 设置HTTP方法
        this.setHttpMethodTags(route.methods);
        
        // 插件配置 - 参考消费管理的处理方式
        if (route.plugins && typeof route.plugins === 'object' && Object.keys(route.plugins).length > 0) {
            console.log('处理路由插件配置:', route.plugins);
            // 将plugins对象转换为插件配置数组
            this.currentRoutePlugins = Object.keys(route.plugins).map(pluginName => {
                const pluginConfig = route.plugins[pluginName];
                return {
                    id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    plugin_name: pluginName,
                    name: `${pluginName}配置`,
                    config: pluginConfig,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });
            console.log('转换后的路由插件数组:', this.currentRoutePlugins);
            this.updateRoutePluginSelection(this.currentRoutePlugins);
        } else {
            console.log('路由没有插件配置');
            this.currentRoutePlugins = [];
            this.updateRoutePluginSelection([]);
        }
        
        // 加载服务选项
        this.loadServiceOptions();
        
        const modal = new bootstrap.Modal(document.getElementById('routeModal'));
        modal.show();
    }
    
    // 查看路由
    viewRoute(routeId) {
        const route = this.routesData.find(r => r.id === routeId);
        if (!route) {
            this.showNotification('路由不存在', 'error');
            return;
        }
        
        // 显示路由详情模态框
        this.showRouteDetailsModal(route);
    }
    
    // 显示路由详情模态框
    showRouteDetailsModal(route) {
        const modalHTML = `
            <div class="modal fade" id="routeDetailsModal" tabindex="-1" aria-labelledby="routeDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="routeDetailsModalLabel">
                                <i class="mdi mdi-eye me-2"></i>路由配置预览
                            </h5>
                        </div>
                        <div class="modal-body p-0">
                            <pre class="bg-dark text-light p-4 m-0" style="font-size: 0.9rem; max-height: 70vh; overflow-y: auto; border-radius: 0;"><code>${JSON.stringify(route, null, 2)}</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的模态框
        const existingModal = document.getElementById('routeDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 添加新的模态框到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('routeDetailsModal'), {
            backdrop: true,
            keyboard: true
        });
        modal.show();
        
        // 模态框关闭后清理DOM
        document.getElementById('routeDetailsModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }
    
    // 切换路由状态
    toggleRouteStatus(routeId) {
        const route = this.routesData.find(r => r.id === routeId);
        if (!route) {
            this.showNotification('路由不存在', 'error');
            return;
        }
        
        const newStatus = route.status === 'enabled' ? 'disabled' : 'enabled';
        const action = newStatus === 'enabled' ? '启用' : '禁用';
        
        this.showConfirm(`确定要${action}路由 "${route.name}" 吗？`, () => {
            route.status = newStatus;
                    this.currentPage = 1;
        this.displayRoutesWithPagination(this.routesData);
        this.updateRoutesStats();
            this.showNotification(`路由已${action}`, 'success');
        });
    }
    
    // 删除路由
    async deleteRoute(routeId) {
        console.log('=== 开始删除路由 ===');
        console.log('要删除的路由ID:', routeId);
        
        const route = this.routesData.find(r => r.id === routeId);
        if (!route) {
            console.error('路由不存在:', routeId);
            this.showNotification('路由不存在', 'error');
            return;
        }
        
        console.log('找到要删除的路由:', route);
        
        this.showConfirm(`确定要删除路由 "${route.name}" 吗？此操作不可恢复！`, async () => {
            try {
                console.log('用户确认删除，开始调用APISIX API...');
                
                // 调用APISIX API删除路由
                const response = await this.apisixRequest(`/routes/${routeId}`, {
                    method: 'DELETE'
                });
                
                console.log('APISIX删除响应:', response);
                this.showNotification('正在刷新数据...', 'info');
                
                // 重新获取路由数据
                console.log('开始重新获取路由数据...');
                const freshRoutes = await this.getRoutes();
                console.log('重新获取的原始数据:', freshRoutes);
                
                if (freshRoutes && Array.isArray(freshRoutes)) {
                    console.log('数据是数组，开始标准化处理...');
                    // 数据标准化处理
                    const normalizedRoutes = this.validateAndNormalizeData(freshRoutes, 'routes');
                    console.log('标准化后的数据:', normalizedRoutes);
                    
                    this.routesData = normalizedRoutes;
                    console.log('更新后的routesData:', this.routesData);
                    
                    // 保存到本地存储
                    this.saveToStorage('routes', this.routesData);
                    
                    // 重新显示列表
                    this.currentPage = 1;
                    this.displayRoutesWithPagination(this.routesData);
                    this.updateRoutesStats();
                    
                    this.showNotification('路由已删除，数据已刷新', 'success');
                } else {
                    console.log('重新获取数据失败或格式不正确，使用本地删除');
                    // 如果重新读取失败，使用本地删除
                    this.routesData = this.routesData.filter(r => r.id !== routeId);
                    this.saveToStorage('routes', this.routesData);
                    this.currentPage = 1;
                    this.displayRoutesWithPagination(this.routesData);
                    this.updateRoutesStats();
                    this.showNotification('路由已删除，但数据刷新失败', 'warning');
                }
            } catch (error) {
                console.error('删除路由失败:', error);
                console.error('错误详情:', {
                    method: 'DELETE',
                    url: `/routes/${routeId}`,
                    error: error.message
                });
                this.showNotification(`删除失败: ${error.message}`, 'error');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }
    
    // 保存路由
    async saveRoute() {
        console.log('=== 开始保存路由 ===');
        
        const form = document.getElementById('route-form');
        if (!form.checkValidity()) {
            console.log('表单验证失败');
            form.reportValidity();
            return;
        }
        
        console.log('表单验证通过');
        
        const routeData = {
            id: document.getElementById('route-id').value || `route-${Date.now()}`,
            name: document.getElementById('route-name').value,
            uri: document.getElementById('route-uri').value,
            methods: this.getSelectedHttpMethods(),
            service: document.getElementById('route-service').value,
            priority: parseInt(document.getElementById('route-priority').value) || 0,
            description: document.getElementById('route-desc').value,
            status: document.getElementById('route-enabled').checked ? 'enabled' : 'disabled',
            createTime: new Date().toLocaleString('zh-CN')
        };
        
        // 验证必填字段
        if (!routeData.name || routeData.name.trim() === '') {
            this.showNotification('路由名称不能为空', 'error');
            return;
        }
        
        if (!routeData.uri || routeData.uri.trim() === '') {
            this.showNotification('URI不能为空', 'error');
            return;
        }
        
        // 检查是否是编辑模式
        const existingIndex = this.routesData.findIndex(r => r.id === routeData.id);
        
        try {
                    // 验证HTTP方法
        console.log('验证HTTP方法:', routeData.methods);
        if (!routeData.methods || routeData.methods.length === 0) {
            this.showNotification('请至少选择一个HTTP方法', 'error');
            return;
        }
        
        // 验证服务ID（如果选择了服务）
        console.log('验证服务ID:', routeData.service);
        console.log('当前服务数据:', this.servicesData);
        if (routeData.service && routeData.service.trim() !== '') {
            const serviceExists = this.servicesData && this.servicesData.find(s => s.id === routeData.service);
            if (!serviceExists) {
                console.log('服务不存在，服务ID:', routeData.service);
                console.log('可用服务:', this.servicesData ? this.servicesData.map(s => s.id) : '无');
                this.showNotification('选择的服务不存在，请重新选择', 'error');
                return;
            }
            console.log('服务验证通过:', serviceExists);
        } else {
            console.log('未选择服务，跳过服务验证');
        }
            

            
            // 准备APISIX API数据格式
            const apisixData = {
                name: routeData.name,
                uri: routeData.uri,
                methods: routeData.methods,
                priority: routeData.priority,
                desc: routeData.description || routeData.name,
                status: routeData.status === 'enabled' ? 1 : 0
            };
            
            // 如果选择了服务，添加服务ID
            if (routeData.service && routeData.service.trim() !== '') {
                apisixData.service_id = routeData.service;
            }
            
            // 处理路由级别的插件配置
            if (this.currentRoutePlugins && this.currentRoutePlugins.length > 0) {
                const pluginsConfig = {};
                this.currentRoutePlugins.forEach(plugin => {
                    // 对特定插件进行配置验证和修正
                    let validatedConfig = { ...plugin.config };
                    
                    // CORS插件特殊处理
                    if (plugin.plugin_name === 'cors') {
                        // 将数组字段转换为APISIX期望的字符串格式
                        if (validatedConfig.allow_origins && Array.isArray(validatedConfig.allow_origins)) {
                            validatedConfig.allow_origins = validatedConfig.allow_origins.join(',');
                        }
                        
                        if (validatedConfig.allow_methods && Array.isArray(validatedConfig.allow_methods)) {
                            validatedConfig.allow_methods = validatedConfig.allow_methods.join(',');
                        }
                        
                        if (validatedConfig.allow_headers && Array.isArray(validatedConfig.allow_headers)) {
                            validatedConfig.allow_headers = validatedConfig.allow_headers.join(',');
                        }
                        
                        if (validatedConfig.expose_headers && Array.isArray(validatedConfig.expose_headers)) {
                            validatedConfig.expose_headers = validatedConfig.expose_headers.join(',');
                        }
                        
                        // 处理allow_origins_by_regex字段
                        if (validatedConfig.allow_origins_by_regex && Array.isArray(validatedConfig.allow_origins_by_regex) && validatedConfig.allow_origins_by_regex.length === 0) {
                            delete validatedConfig.allow_origins_by_regex;
                        }
                        
                        // 如果所有字段都为空，跳过这个插件
                        if (!validatedConfig.allow_origins && !validatedConfig.allow_origins_by_regex && !validatedConfig.allow_methods && !validatedConfig.allow_headers) {
                            console.log('CORS插件的所有字段都为空，跳过该插件');
                            return;
                        }
                    }
                    
                    // consumer-restriction 插件特殊处理
                    if (plugin.plugin_name === 'consumer-restriction') {
                        // APISIX要求whitelist或blacklist至少有一个不为空
                        if ((!validatedConfig.whitelist || validatedConfig.whitelist.length === 0) && 
                            (!validatedConfig.blacklist || validatedConfig.blacklist.length === 0)) {
                            // 如果两个都为空，默认设置whitelist为通配符
                            validatedConfig.whitelist = ['*'];
                            console.log('consumer-restriction插件配置修正：whitelist设置为["*"]');
                        }
                        
                        // 确保数组字段不为空，如果为空则设置默认值
                        if (!validatedConfig.whitelist || validatedConfig.whitelist.length === 0) {
                            validatedConfig.whitelist = ['*'];
                        }
                        if (!validatedConfig.blacklist || validatedConfig.blacklist.length === 0) {
                            validatedConfig.blacklist = ['placeholder'];
                        }
                        
                        console.log('consumer-restriction插件最终配置:', validatedConfig);
                    }
                    
                    pluginsConfig[plugin.plugin_name] = validatedConfig;
                });
                apisixData.plugins = pluginsConfig;
            }
            
            console.log('准备保存的路由数据:', apisixData);
            console.log('路由ID:', routeData.id);
            console.log('HTTP方法:', routeData.methods);
            console.log('服务ID:', routeData.service);
            console.log('发送给APISIX的完整数据:', JSON.stringify(apisixData, null, 2));
            
            // APISIX路由API使用PUT方法（创建和更新）
            const response = await this.apisixRequest(`/routes/${routeData.id}`, {
                method: 'PUT',
                body: JSON.stringify(apisixData)
            });
            
            console.log('APISIX保存响应:', response);
            
            if (existingIndex >= 0) {
                this.showNotification('路由已更新到APISIX', 'success');
            } else {
                this.showNotification('路由已创建到APISIX', 'success');
            }
            
            // 保存成功后，立即从APISIX重新读取最新数据
            this.showNotification('正在刷新数据...', 'info');
            
            // 重新获取路由数据
            console.log('开始重新获取路由数据...');
            const freshRoutes = await this.getRoutes();
            console.log('重新获取的原始数据:', freshRoutes);
            
            if (freshRoutes && Array.isArray(freshRoutes)) {
                console.log('数据是数组，开始标准化处理...');
                // 数据标准化处理
                const normalizedRoutes = this.validateAndNormalizeData(freshRoutes, 'routes');
                console.log('标准化后的数据:', normalizedRoutes);
                
                this.routesData = normalizedRoutes;
                console.log('更新后的routesData:', this.routesData);
                
                // 保存到本地存储
                this.saveToStorage('routes', this.routesData);
                
                // 重新显示列表
                this.currentPage = 1;
                this.displayRoutesWithPagination(this.routesData);
                this.updateRoutesStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('数据已刷新，显示最新配置', 'success');
            } else {
                console.log('重新获取数据失败或格式不正确，使用本地数据');
                // 如果重新读取失败，使用本地数据
                if (existingIndex >= 0) {
                    this.routesData[existingIndex] = routeData;
                } else {
                    this.routesData.push(routeData);
                }
                
                this.saveToStorage('routes', this.routesData);
                this.currentPage = 1;
                this.displayRoutesWithPagination(this.routesData);
                this.updateRoutesStats();
                
                // 如果当前在概览页面，更新访问链路关系
                if (this.currentPage === 'overview') {
                    this.currentPage = 1;
                    this.updateOverviewAccessChains();
                }
                
                this.showNotification('保存成功，但数据刷新失败', 'warning');
            }
            
            // 关闭模态框
            const modalElement = document.getElementById('routeModal');
            if (modalElement) {
                try {
                    // 尝试使用Bootstrap 5的方法
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                    } else {
                        // 如果获取实例失败，直接操作DOM
                        modalElement.classList.remove('show');
                        modalElement.style.display = 'none';
                        document.body.classList.remove('modal-open');
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                    }
                } catch (error) {
                    console.warn('关闭模态框失败，使用DOM操作:', error);
                    // 直接操作DOM关闭模态框
                    modalElement.classList.remove('show');
                    modalElement.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.remove();
                    }
                }
            }
            
        } catch (error) {
            console.error('保存路由到APISIX失败:', error);
            console.error('错误详情:', {
                method: 'PUT',
                url: `/routes/${routeData.id}`,
                data: routeData,
                error: error.message
            });
            
            // 如果是400错误，提供更详细的错误信息
            if (error.message.includes('400')) {
                console.error('400错误详情:', {
                    routeData: routeData,
                    error: error.message
                });
                this.showNotification('请求数据格式错误，请检查输入信息（特别是HTTP方法和服务配置）', 'error');
            } else if (error.message.includes('405')) {
                this.showNotification('API方法不被允许，请检查APISIX版本和配置', 'error');
            } else {
                this.showNotification(`保存失败: ${error.message}`, 'error');
            }
        }
    }

    // 插件管理页面：只负责创建和保存配置模板
    // 应用插件的功能在服务/消费管理页面中实现

    // 显示应用目标选择对话框
    showApplyTargetDialog(pluginName, configData) {
        const plugin = this.allPlugins.find(p => p.name === pluginName);
        if (!plugin) return;
        
        const modalId = `apply-target-modal-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">将 ${plugin.title || pluginName} 应用到</h5>
                            <button type="button" class="btn-close" data-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <i class="mdi mdi-server mdi-48px text-primary mb-3"></i>
                                            <h6>服务</h6>
                                            <p class="text-muted small">应用到具体的服务配置</p>
                                            <button class="btn btn-primary" onclick="window.apisixAdmin.applyToService('${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                                选择服务
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <i class="mdi mdi-account-group mdi-48px text-success mb-3"></i>
                                            <h6>消费者</h6>
                                            <p class="text-muted small">应用到具体的消费者配置</p>
                                            <button class="btn btn-success" onclick="window.apisixAdmin.applyToConsumer('${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                                选择消费者
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 应用到服务
    applyToService(pluginName, encodedConfigData) {
        try {
            const configData = JSON.parse(atob(encodedConfigData));
            this.showServiceSelector(pluginName, configData);
        } catch (error) {
            console.error('解析配置数据失败:', error);
            this.showNotification('配置数据解析失败', 'error');
        }
    }

    // 应用到消费者
    applyToConsumer(pluginName, encodedConfigData) {
        try {
            const configData = JSON.parse(atob(encodedConfigData));
            this.showConsumerSelector(pluginName, configData);
        } catch (error) {
            console.error('解析配置数据失败:', error);
            this.showNotification('配置数据解析失败', 'error');
        }
    }

    // 显示服务选择器
    showServiceSelector(pluginName, configData) {
        const modalId = `service-selector-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">选择要应用 ${pluginName} 插件的服务</h5>
                            <button type="button" class="btn-close" data-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <button class="btn btn-primary" onclick="window.apisixAdmin.createNewServiceWithPlugin('${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                    <i class="mdi mdi-plus"></i> 创建新服务
                                </button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>服务名称</th>
                                            <th>上游</th>
                                            <th>状态</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this.servicesData ? this.servicesData.map(service => `
                                            <tr>
                                                <td>${service.name}</td>
                                                <td>${service.upstream || '未设置'}</td>
                                                <td>
                                                    <span class="badge bg-${service.status === 'enabled' ? 'success' : 'secondary'}">
                                                        ${service.status === 'enabled' ? '启用' : '禁用'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-primary" onclick="window.apisixAdmin.applyPluginToService('${service.id}', '${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                                        应用插件
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="4" class="text-center text-muted">暂无服务数据</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 显示消费者选择器
    showConsumerSelector(pluginName, configData) {
        const modalId = `consumer-selector-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">选择要应用 ${pluginName} 插件的消费者</h5>
                            <button type="button" class="btn-close" data-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <button class="btn btn-primary" onclick="window.apisixAdmin.createNewConsumerWithPlugin('${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                    <i class="mdi mdi-plus"></i> 创建新消费者
                                </button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>消费者名称</th>
                                            <th>描述</th>
                                            <th>状态</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this.consumersData ? this.consumersData.map(consumer => `
                                            <tr>
                                                <td>${consumer.username}</td>
                                                <td>${consumer.desc || '无描述'}</td>
                                                <td>
                                                    <span class="badge bg-${consumer.status === 'enabled' ? 'success' : 'secondary'}">
                                                        ${consumer.status === 'enabled' ? '启用' : '禁用'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-primary" onclick="window.apisixAdmin.applyPluginToConsumer('${consumer.id}', '${pluginName}', '${btoa(JSON.stringify(configData))}')">
                                                        应用插件
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="4" class="text-center text-muted">暂无消费者数据</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 保存配置模板到etcd
    async savePluginConfigTemplate(configTemplate) {
        console.log('=== 开始保存配置模板 ===');
        console.log('要保存的配置模板:', configTemplate);
        
        try {
            // 保存到etcd
            if (this.etcdClient) {
                await this.etcdClient.saveTemplate(configTemplate);
                console.log('配置模板已保存到etcd:', configTemplate.id);
                
                // 保存成功后，重新从etcd加载到内存
                // 配置模板现在直接从etcd读取，不需要重新加载到内存
                
                // 刷新显示
                this.renderPluginConfigTemplates();
            } else {
                console.warn('etcd客户端未初始化，跳过保存');
            }
            
            console.log('=== 配置模板保存完成 ===');
        } catch (error) {
            console.error('保存配置模板失败:', error);
            throw error;
        }
    }

        // 导出配置模板到文件

    // 导出配置模板到文件
    async exportPluginConfigTemplates() {
        try {
            const data = {
                templates: '直接从etcd读取',
                version: "1.0.0",
                last_updated: new Date().toISOString(),
                export_source: "APISIX Admin Panel - etcd"
            };
            
            // 创建下载链接
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plugin-config-templates-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('配置模板已导出到文件', 'success');
        } catch (error) {
            console.error('导出配置模板失败:', error);
            this.showNotification('导出配置模板失败', 'error');
        }
    }
    
    // 导入配置模板从文件
    async importPluginConfigTemplates(file) {
        try {
            if (!this.etcdClient) {
                console.error('etcd客户端未初始化');
                return;
            }
            
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.templates || !Array.isArray(data.templates)) {
                throw new Error('文件格式不正确，缺少templates数组');
            }
            
            // 导入新数据到etcd
            for (const template of data.templates) {
                // 确保有必要的字段
                if (template.id && template.name && template.plugin_name) {
                    await this.etcdClient.saveTemplate(template);
                }
            }
            
            // 配置模板现在直接从etcd读取，不需要重新加载到内存
            
            // 刷新显示
            this.renderPluginConfigTemplates();
            
            this.showNotification(`成功导入 ${data.templates.length} 个配置模板`, 'success');
            
        } catch (error) {
            console.error('导入配置模板失败:', error);
            this.showNotification('导入配置模板失败: ' + error.message, 'error');
        }
    }
    
    // 处理导入文件选择
    async handleImportTemplates(input) {
        const file = input.files[0];
        if (file) {
            try {
                await this.importPluginConfigTemplates(file);
                // 清空文件选择器
                input.value = '';
            } catch (error) {
                console.error('处理导入文件失败:', error);
            }
        }
    }

    // 获取配置模板列表 - 直接从etcd读取
    async getPluginConfigTemplates() {
        if (!this.etcdClient) {
            console.warn('etcd客户端未初始化');
            return [];
        }
        try {
            return await this.etcdClient.getTemplates();
        } catch (error) {
            console.error('获取配置模板失败:', error);
            return [];
        }
    }
    
    // 强制从etcd刷新配置模板
    async forceRefreshFromEtcd() {
        console.log('=== 强制从etcd刷新配置模板 ===');
        try {
            if (this.etcdClient) {
                const templates = await this.etcdClient.getTemplates();
                // 配置模板现在直接从etcd读取，不需要重新加载到内存
                console.log('从etcd强制刷新完成，模板数量:', templates.length);
                return templates;
            } else {
                console.warn('etcd客户端未初始化');
                return [];
            }
        } catch (error) {
            console.error('强制刷新失败:', error);
            return [];
        }
    }

    // 删除配置模板
    async deletePluginConfigTemplate(configId) {
        this.showConfirm('确定要删除这个配置模板吗？此操作不可恢复！', async () => {
            try {
                if (!this.etcdClient) {
                    console.error('etcd客户端未初始化');
                    return;
                }
                
                // 从etcd删除
                await this.etcdClient.deleteTemplate(configId);
                console.log('配置模板已从etcd删除:', configId);
                
                // 配置模板现在直接从etcd读取，不需要重新加载到内存
                
                // 刷新显示
                this.renderPluginConfigTemplates();
                this.showNotification('配置模板已删除', 'success');
                
            } catch (error) {
                console.error('删除配置模板失败:', error);
                this.showNotification('删除配置模板失败: ' + error.message, 'error');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '删除' });
    }

    // 清空所有配置模板
    async clearAllConfigTemplates() {
        this.showConfirm('确定要清空所有配置模板吗？此操作不可恢复！', async () => {
            try {
                if (!this.etcdClient) {
                    console.error('etcd客户端未初始化');
                    return;
                }
                
                // 获取所有模板并逐个删除
                const templates = await this.etcdClient.getTemplates();
                for (const template of templates) {
                    await this.etcdClient.deleteTemplate(template.id);
                }
                console.log('etcd中的所有配置模板已清空');
                
                // 配置模板现在直接从etcd读取，不需要清空内存
                
                // 刷新显示
                this.renderPluginConfigTemplates();
                this.showNotification('所有配置模板已清空', 'success');
                
            } catch (error) {
                console.error('清空配置模板失败:', error);
                this.showNotification('清空配置模板失败: ' + error.message, 'error');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '清空所有' });
    }
    
    // 重置配置模板到etcd中的原始状态
    async resetPluginConfigTemplates() {
        this.showConfirm('确定要重置配置模板到etcd中的原始状态吗？这将丢失所有新增的模板！', async () => {
            console.log('重置配置模板到etcd状态...');
            
            try {
                if (!this.etcdClient) {
                    console.error('etcd客户端未初始化');
                    return;
                }
                
                // 清空所有现有模板
                const templates = await this.etcdClient.getTemplates();
                for (const template of templates) {
                    await this.etcdClient.deleteTemplate(template.id);
                }
                
                // 初始化默认模板
                await this.etcdClient.initializeDefaultTemplates();
                
                // 配置模板现在直接从etcd读取，不需要重新加载到内存
                this.renderPluginConfigTemplates();
                this.showNotification('配置模板已重置到etcd状态', 'success');
                
            } catch (error) {
                console.error('重置配置模板失败:', error);
                this.showNotification('重置配置模板失败: ' + error.message, 'error');
            }
        }, { confirmBtnClass: 'btn-warning', confirmText: '重置' });
    }
    
    // 强制刷新配置模板（从etcd重新读取）
    async forceRefreshPluginConfigTemplates() {
        console.log('=== 强制刷新配置模板 ===');
        try {
            if (!this.etcdClient) {
                console.error('etcd客户端未初始化');
                return;
            }
            
            // 配置模板现在直接从etcd读取，不需要清空内存
            console.log('配置模板现在直接从etcd读取');
            
            // 配置模板现在直接从etcd读取，不需要重新加载到内存
            console.log('配置模板现在直接从etcd读取');
            
            // 刷新显示
            this.renderPluginConfigTemplates();
            this.showNotification('配置模板已强制刷新', 'success');
        } catch (error) {
            console.error('强制刷新失败:', error);
            this.showNotification('强制刷新失败: ' + error.message, 'error');
        }
    }
    
    // 清理etcd中的配置模板缓存
    async clearIndexedDBTemplates() {
        this.showConfirm('确定要清理etcd中的配置模板缓存吗？这将清空所有已保存的模板！', async () => {
            try {
                if (!this.etcdClient) {
                    console.error('etcd客户端未初始化');
                    return;
                }
                
                // 清理etcd
                const templates = await this.etcdClient.getTemplates();
                for (const template of templates) {
                    await this.etcdClient.deleteTemplate(template.id);
                }
                console.log('已清理etcd中的配置模板缓存');
                
                // 配置模板现在直接从etcd读取，不需要清空内存
                console.log('配置模板现在直接从etcd读取');
                
                // 刷新显示
                this.renderPluginConfigTemplates();
                this.showNotification('配置模板缓存已清理', 'success');
            } catch (error) {
                console.error('清理缓存失败:', error);
                this.showNotification('清理缓存失败: ' + error.message, 'error');
            }
        }, { confirmBtnClass: 'btn-danger', confirmText: '清理' });
    }

    // 编辑配置模板
    async editPluginConfigTemplate(configId) {
        const templates = await this.getPluginConfigTemplates();
        const template = templates.find(t => t.id === configId);
        if (!template) {
            this.showNotification('配置模板不存在', 'error');
            return;
        }

        // 找到对应的插件并打开配置
        const plugin = this.allPlugins.find(p => p.name === template.plugin_name);
        if (plugin) {
            // 设置当前编辑的配置模板
            this.currentEditingConfigTemplate = template;
            
            // 将模板配置合并到插件配置中
            plugin.config = { ...plugin.config, ...template.config };
            plugin.config.name = template.name;
            plugin.config.description = template.description;
            
            this.configPlugin02(template.plugin_name);
        } else {
            this.showNotification('插件不存在', 'error');
        }
    }

    // 显示配置模板选择器（用于服务/路由配置）
    async showConfigTemplateSelector(pluginName, callback) {
        console.log('=== 显示配置模板选择器 ===');
        console.log('插件名称:', pluginName);
        console.log('回调函数:', callback);
        
        const templates = await this.getPluginConfigTemplates();
        const filteredTemplates = templates.filter(t => t.plugin_name === pluginName);
        console.log('过滤后的模板:', filteredTemplates);
        
        // 调试：检查etcd中的配置模板
        console.log('etcd中的配置模板总数:', templates.length);
        console.log('etcd中的配置模板:', templates);
        
        if (filteredTemplates.length === 0) {
            this.showNotification('没有找到该插件的配置模板，请先在插件管理中创建', 'warning');
            return;
        }

        const modalId = `template-selector-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="mdi mdi-puzzle me-2"></i>选择 ${pluginName} 配置模板
                            </h5>
                            <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal" style="font-size: 1.5rem; line-height: 1; text-decoration: none;">
                                <i class="mdi mdi-close"></i>
                            </button>
                        </div>
                        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                            <div class="list-group">
                                ${filteredTemplates.map(t => `
                                    <div class="list-group-item list-group-item-action" data-config-id="${t.id}" data-config-name="${t.name}">
                                        <div class="d-flex w-100 justify-content-between align-items-start">
                                            <div class="flex-grow-1">
                                                <h6 class="mb-1 text-primary">${t.name}</h6>
                                                <p class="mb-1 text-muted">${t.description || '无描述'}</p>
                                                <small class="text-muted">
                                                    <i class="mdi mdi-calendar me-1"></i>创建时间: ${new Date(t.created_at).toLocaleString()}
                                                </small>
                                            </div>
                                            <div class="ms-3">
                                                <span class="badge bg-info">${t.plugin_name}</span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="modal-footer bg-light">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">
                                <i class="mdi mdi-close me-1"></i>取消
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 绑定点击事件
        const modal = document.getElementById(modalId);
        const listItems = modal.querySelectorAll('.list-group-item');
        console.log('找到的列表项数量:', listItems.length);
        
        listItems.forEach((item, index) => {
            console.log(`绑定第${index + 1}个列表项:`, item.dataset);
            item.addEventListener('click', () => {
                const configId = item.dataset.configId;
                const configName = item.dataset.configName;
                console.log('点击了配置模板:', configId, configName);
                
                if (callback) {
                    console.log('调用回调函数');
                    callback(configId, configName);
                } else {
                    console.error('回调函数不存在');
                }
                $(`#${modalId}`).modal('hide');
            });
        });
        
        // 显示模态框
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 显示插件选择器（用于服务/消费者/路由配置）
    showPluginSelector(targetType, targetId, callback) {
        const modalId = `plugin-selector-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-fullscreen-lg-down modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white sticky-top">
                            <h5 class="modal-title">为${targetType === 'service' ? '服务' : targetType === 'consumer' ? '消费者' : '路由'}选择插件</h5>
                            <div class="d-flex align-items-center">
                                <small class="me-3 text-white-50" id="plugin-count-info">加载中...</small>
                            <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal" style="font-size: 1.5rem; line-height: 1; text-decoration: none;">
                                <i class="mdi mdi-close"></i>
                            </button>
                            </div>
                        </div>
                        <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
                            <!-- 提示信息 -->
                            <div class="alert alert-info mb-3" role="alert">
                                <i class="mdi mdi-information-outline me-2"></i>
                                <strong>提示：</strong>此处只显示已创建配置模板的插件。如需使用其他插件，请先在插件管理中创建相应的配置模板。
                            </div>
                            
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="sticky-top" style="top: 1rem;">
                                        <!-- 搜索框 -->
                                        <div class="mb-3">
                                            <div class="input-group">
                                                <input type="text" class="form-control" id="plugin-search" placeholder="搜索插件..." style="font-size: 0.9rem;">
                                                <button class="btn btn-outline-secondary" type="button" id="plugin-search-btn">
                                                    <i class="mdi mdi-magnify"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- 分类筛选 -->
                                        <div class="list-group" id="plugin-categories">
                                            <button class="list-group-item list-group-item-action active" data-category="all">
                                                <i class="mdi mdi-puzzle me-2"></i>全部插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="ai">
                                                <i class="mdi mdi-robot me-2"></i>AI插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="auth">
                                                <i class="mdi mdi-key me-2"></i>认证插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="security">
                                                <i class="mdi mdi-shield-outline me-2"></i>安全插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="traffic">
                                                <i class="mdi mdi-speedometer me-2"></i>流量控制插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="observe">
                                                <i class="mdi mdi-chart-bar me-2"></i>可观测性插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="log">
                                                <i class="mdi mdi-file-document me-2"></i>日志插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="transform">
                                                <i class="mdi mdi-sync me-2"></i>转换插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="general">
                                                <i class="mdi mdi-cog me-2"></i>通用插件
                                            </button>
                                            <button class="list-group-item list-group-item-action" data-category="other">
                                                <i class="mdi mdi-dots-horizontal me-2"></i>其他插件
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-9">
                                    <div id="plugin-list" class="row g-3">
                                        <!-- 插件列表将在这里动态生成 -->
                                        <div class="col-12 text-center py-5">
                                            <div class="spinner-border text-primary" role="status">
                                                <span class="visually-hidden">加载中...</span>
                                            </div>
                                            <p class="mt-2 text-muted">正在加载插件列表...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer bg-light sticky-bottom">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">
                                <i class="mdi mdi-close me-1"></i>关闭
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 绑定事件
        this.bindPluginSelectorEvents(modalId, targetType, targetId, callback);
        
        // 显示模态框
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 绑定插件选择器事件
    bindPluginSelectorEvents(modalId, targetType, targetId, callback) {
        const categoryButtons = document.querySelectorAll(`#${modalId} #plugin-categories button`);
        const pluginList = document.querySelector(`#${modalId} #plugin-list`);
        const searchInput = document.querySelector(`#${modalId} #plugin-search`);
        const searchBtn = document.querySelector(`#${modalId} #plugin-search-btn`);

        // 分类筛选
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                // 重置搜索
                if (searchInput) searchInput.value = '';
                await this.renderPluginList(pluginList, e.target.dataset.category, '');
            });
        });

        // 搜索功能
        if (searchInput) {
            searchInput.addEventListener('input', async (e) => {
                const searchTerm = e.target.value.trim();
                const activeCategory = document.querySelector(`#${modalId} #plugin-categories .active`).dataset.category;
                await this.renderPluginList(pluginList, activeCategory, searchTerm);
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', async () => {
                const searchTerm = searchInput ? searchInput.value.trim() : '';
                const activeCategory = document.querySelector(`#${modalId} #plugin-categories .active`).dataset.category;
                await this.renderPluginList(pluginList, activeCategory, searchTerm);
            });
        }

        // 初始渲染
        this.renderPluginList(pluginList, 'all', '');
    }

    // 渲染插件列表
    async renderPluginList(container, category, searchTerm = '') {
        let plugins = this.allPlugins || [];
        
        // 分类筛选
        if (category && category !== 'all') {
            plugins = plugins.filter(p => p.category === category);
        }

        // 搜索筛选
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            plugins = plugins.filter(p => 
                p.name.toLowerCase().includes(term) ||
                (p.title && p.title.toLowerCase().includes(term)) ||
                (p.desc && p.desc.toLowerCase().includes(term))
            );
        }

        // 获取当前模态框的targetType和targetId
        const modal = container.closest('.modal');
        let targetType = 'service'; // 默认值
        if (modal) {
            const title = modal.querySelector('.modal-title').textContent;
            if (title.includes('服务')) {
                targetType = 'service';
            } else if (title.includes('消费者')) {
                targetType = 'consumer';
            } else if (title.includes('路由')) {
                targetType = 'route';
            }
        }
        const targetId = null; // 对于新建服务/消费者/路由，targetId为null

        // 获取有配置模板的插件列表
        const templates = await this.getPluginConfigTemplates();
        const pluginsWithTemplates = plugins.filter(plugin => {
            return templates.some(template => template.plugin_name === plugin.name);
        });

        // 更新插件数量信息
        if (modal) {
            const countInfo = modal.querySelector('#plugin-count-info');
            if (countInfo) {
                countInfo.textContent = `可用插件: ${pluginsWithTemplates.length} 个`;
            }
        }

        if (pluginsWithTemplates.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="text-muted mb-3">
                        <i class="mdi mdi-alert-circle-outline mdi-48px"></i>
                    </div>
                    <h5 class="text-muted">暂无可用插件</h5>
                    <p class="text-muted">请先在插件管理中为插件创建配置模板</p>
                    <button class="btn btn-primary" onclick="window.apisixAdmin.switchToPage('plugin-management')">
                        <i class="mdi mdi-cog me-1"></i>去插件管理
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = pluginsWithTemplates.map(plugin => {
            // 找到该插件的配置模板数量
            const templateCount = templates.filter(t => t.plugin_name === plugin.name).length;
            
            return `
            <div class="col-lg-4 col-md-6 col-sm-6 mb-3">
                <div class="card border h-100">
                    <div class="card-body p-3">
                        <div class="d-flex align-items-center mb-2">
                            <div class="text-${plugin.color} me-2">
                                <i class="mdi ${plugin.icon} mdi-18px"></i>
                            </div>
                            <h6 class="card-title mb-1 small">${plugin.title || plugin.name}</h6>
                                <span class="badge bg-success ms-auto" title="配置模板数量">${templateCount}</span>
                        </div>
                        <p class="card-text small text-muted mb-2" style="font-size: 0.8rem;">${plugin.desc || ''}</p>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary btn-sm" onclick="window.apisixAdmin.selectPluginForTarget('${plugin.name}', '${targetType}', null)" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">
                                选择
                            </button>
                            <button class="btn btn-sm btn-outline-info btn-sm" onclick="window.apisixAdmin.viewPluginConfig('${plugin.name}')" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">
                                查看
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    // 选择插件
    async selectPluginForTarget(pluginName, targetType, targetId) {
        console.log('=== 选择插件 ===');
        console.log('插件名称:', pluginName);
        console.log('目标类型:', targetType);
        console.log('目标ID:', targetId);
        console.log('targetId类型:', typeof targetId);
        console.log('targetId === null:', targetId === null);
        console.log('targetId === "null":', targetId === "null");
        
        // 检查是否有该插件的配置模板
        const templates = await this.getPluginConfigTemplates();
        const filteredTemplates = templates.filter(t => t.plugin_name === pluginName);
        console.log('找到的配置模板:', filteredTemplates);
        
        if (filteredTemplates.length === 0) {
            // 没有配置模板，提示用户先去插件管理创建
            this.showNotification(`请先在插件管理中为 ${pluginName} 创建配置模板`, 'warning');
            return;
        }

        if (filteredTemplates.length === 1) {
            // 只有一个配置模板，直接应用
            console.log('只有一个配置模板，直接应用:', filteredTemplates[0]);
            this.applyPluginTemplate(filteredTemplates[0], targetType, targetId);
        } else {
            // 多个配置模板，让用户选择
            console.log('多个配置模板，显示选择器');
            this.showConfigTemplateSelector(pluginName, (configId, configName) => {
                console.log('用户选择了配置模板:', configId, configName);
                const template = filteredTemplates.find(t => t.id === configId);
                if (template) {
                    console.log('找到对应的模板:', template);
                    this.applyPluginTemplate(template, targetType, targetId);
                } else {
                    console.error('未找到对应的模板');
                }
            });
        }
    }

    // 应用插件配置模板
    applyPluginTemplate(template, targetType, targetId) {
        console.log('=== 应用插件配置模板 ===');
        console.log('模板:', template);
        console.log('目标类型:', targetType);
        console.log('目标ID:', targetId);
        console.log('targetId类型:', typeof targetId);
        console.log('targetId === null:', targetId === null);
        console.log('targetId === "null":', targetId === "null");
        console.log('targetId truthy:', !!targetId);
        
        if (targetType === 'service') {
            if (targetId) {
                console.log('编辑现有服务，调用 applyPluginToService');
                // 编辑现有服务
                this.applyPluginToService(targetId, template.plugin_name, this.safeEncode(JSON.stringify(template)));
            } else {
                console.log('新建服务，调用 addPluginToServiceSelection');
                // 新建服务，直接添加到当前选择列表
                this.addPluginToServiceSelection(template);
            }
        } else if (targetType === 'consumer') {
            if (targetId) {
                console.log('编辑现有消费者，调用 applyPluginToConsumer');
                // 编辑现有消费者
                this.applyPluginToConsumer(targetId, template.plugin_name, this.safeEncode(JSON.stringify(template)));
            } else {
                console.log('新建消费者，调用 addPluginToConsumerSelection');
                // 新建消费者，直接添加到当前选择列表
                this.addPluginToConsumerSelection(template);
            }
        } else if (targetType === 'route') {
            console.log('路由插件，调用 addPluginToRouteSelection');
            // 路由插件，直接添加到当前选择列表
            this.addPluginToRouteSelection(template);
        }
    }

    // 安全的编码函数，处理包含中文字符的字符串
    safeEncode(str) {
        try {
            // 先尝试使用 btoa
            return btoa(str);
        } catch (e) {
            // 如果失败，使用 encodeURIComponent + btoa 的组合
            return btoa(encodeURIComponent(str));
        }
    }

    // 安全的解码函数，对应 safeEncode
    safeDecode(encodedStr) {
        try {
            // 先尝试直接 atob
            const decoded = atob(encodedStr);
            try {
                // 尝试解析为JSON
                return JSON.parse(decoded);
            } catch (e) {
                // 如果失败，尝试 decodeURIComponent
                return JSON.parse(decodeURIComponent(decoded));
            }
        } catch (e) {
            console.error('解码失败:', e);
            return null;
        }
    }

    // 查看插件配置
    async viewPluginConfig(pluginName) {
        const templates = await this.getPluginConfigTemplates();
        const filteredTemplates = templates.filter(t => t.plugin_name === pluginName);
        
        if (filteredTemplates.length === 0) {
            this.showNotification(`没有找到 ${pluginName} 的配置模板`, 'info');
            return;
        }

        const modalId = `plugin-config-view-${Date.now()}`;
        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${pluginName} 配置模板</h5>
                            <button type="button" class="btn-close" data-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${filteredTemplates.map(template => `
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h6 class="mb-0">${template.name}</h6>
                                    </div>
                                    <div class="card-body">
                                        <p class="text-muted">${template.description || '无描述'}</p>
                                        <div class="row">
                                            <div class="col-md-6">
                                                <small class="text-muted">创建时间: ${new Date(template.created_at).toLocaleString()}</small>
                                            </div>
                                            <div class="col-md-6">
                                                <small class="text-muted">更新时间: ${new Date(template.updated_at).toLocaleString()}</small>
                                            </div>
                                        </div>
                                        <div class="mt-2">
                                            <strong>配置内容:</strong>
                                            <pre class="bg-light p-2 mt-1 small">${JSON.stringify(template.config, null, 2)}</pre>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>`;

        // 显示模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        $(`#${modalId}`).modal('show');
        
        // 模态框关闭后清理
        $(`#${modalId}`).on('hidden.bs.modal', function() {
            this.remove();
        });
    }

    // 添加插件到服务选择列表（新建服务时）
    addPluginToServiceSelection(template) {
        // 关闭插件选择器模态框
        const pluginSelectorModal = document.querySelector('.modal.show');
        if (pluginSelectorModal) {
            $(pluginSelectorModal).modal('hide');
        }
        
        // 添加到当前服务插件选择
        if (!this.currentServicePlugins) {
            this.currentServicePlugins = [];
        }
        
        // 检查是否已经添加过
        const existingIndex = this.currentServicePlugins.findIndex(p => p.id === template.id);
        if (existingIndex >= 0) {
            this.showNotification('该插件配置已添加', 'warning');
            return;
        }
        
        // 保留必要的字段，包括name和created_at用于显示
        const pluginConfig = {
            id: template.id,
            plugin_name: template.plugin_name,
            name: template.name,
            created_at: template.created_at,
            config: template.config,
            enabled: true
        };
        
        console.log('=== 添加插件到服务选择 ===');
        console.log('原始模板:', template);
        console.log('原始模板的config字段:', template.config);
        console.log('转换后的插件配置:', pluginConfig);
        console.log('转换后的插件配置的config字段:', pluginConfig.config);
        
        this.currentServicePlugins.push(pluginConfig);
        
        // 延迟更新UI，确保插件选择器模态框完全关闭后再更新
        setTimeout(() => {
            this.updateServicePluginSelection(this.currentServicePlugins);
        }, 300);
        
        this.showNotification(`插件 ${template.plugin_name} 已添加到服务`, 'success');
    }

    // 添加插件到消费者选择列表（新建消费者时）
    addPluginToConsumerSelection(template) {
        // 关闭插件选择器模态框
        const pluginSelectorModal = document.querySelector('.modal.show');
        if (pluginSelectorModal) {
            $(pluginSelectorModal).modal('hide');
        }
        
        // 添加到当前消费者插件选择
        if (!this.currentConsumerPlugins) {
            this.currentConsumerPlugins = [];
        }
        
        // 检查是否已经添加过
        const existingIndex = this.currentConsumerPlugins.findIndex(p => p.plugin_name === template.plugin_name);
        if (existingIndex >= 0) {
            this.showNotification('该插件已添加', 'warning');
            return;
        }
        
        // 为消费者生成个性化配置
        const personalizedConfig = this.generateConsumerPluginConfig(template);
        
        // 保留必要的字段，包括name和created_at用于显示
        const pluginConfig = {
            id: `consumer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            plugin_name: template.plugin_name,
            name: template.name,
            created_at: new Date().toISOString(),
            config: personalizedConfig,
            enabled: true
        };
        
        this.currentConsumerPlugins.push(pluginConfig);
        this.updateConsumerPluginSelection(this.currentConsumerPlugins);
        
        this.showNotification(`插件 ${template.plugin_name} 已添加到消费者`, 'success');
    }

    // 添加插件到路由选择列表（新建路由时）
    addPluginToRouteSelection(template) {
        // 关闭插件选择器模态框
        const pluginSelectorModal = document.querySelector('.modal.show');
        if (pluginSelectorModal) {
            $(pluginSelectorModal).modal('hide');
        }
        
        // 添加到当前路由插件选择
        if (!this.currentRoutePlugins) {
            this.currentRoutePlugins = [];
        }
        
        // 检查是否已经添加过
        const existingIndex = this.currentRoutePlugins.findIndex(p => p.plugin_name === template.plugin_name);
        if (existingIndex >= 0) {
            this.showNotification('该插件已添加', 'warning');
            return;
        }
        
        // 对特定插件进行配置验证和修正
        let validatedConfig = { ...template.config };
        
        if (template.plugin_name === 'consumer-restriction') {
            // APISIX要求whitelist或blacklist至少有一个不为空
            if ((!validatedConfig.whitelist || validatedConfig.whitelist.length === 0) && 
                (!validatedConfig.blacklist || validatedConfig.blacklist.length === 0)) {
                // 如果两个都为空，默认设置whitelist为通配符
                validatedConfig.whitelist = ['*'];
                console.log('consumer-restriction插件配置修正：whitelist设置为["*"]');
            }
            
            // 确保数组字段不为空，如果为空则设置默认值
            if (!validatedConfig.whitelist || validatedConfig.whitelist.length === 0) {
                validatedConfig.whitelist = ['*'];
            }
            if (!validatedConfig.blacklist || validatedConfig.blacklist.length === 0) {
                validatedConfig.blacklist = ['placeholder'];
            }
            
            console.log('consumer-restriction插件最终配置:', validatedConfig);
        }
        
        // 保留必要的字段，包括name和created_at用于显示
        const pluginConfig = {
            id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            plugin_name: template.plugin_name,
            name: template.name,
            created_at: new Date().toISOString(),
            config: validatedConfig,
            enabled: true
        };
        
        this.currentRoutePlugins.push(pluginConfig);
        this.updateRoutePluginSelection(this.currentRoutePlugins);
        
        this.showNotification(`插件 ${template.plugin_name} 已添加到路由`, 'success');
    }

    // 应用插件到服务
    applyPluginToService(serviceId, pluginName, encodedConfigData) {
        try {
            const configData = this.safeDecode(encodedConfigData);
            if (!configData) {
                this.showNotification('插件配置数据解码失败', 'error');
                return;
            }
            
            const service = this.servicesData.find(s => s.id === serviceId);
            
            if (!service) {
                this.showNotification('服务不存在', 'error');
                return;
            }

            // 初始化插件的plugins对象
            if (!service.plugins) {
                service.plugins = {};
            }

            // 应用插件配置
            service.plugins[pluginName] = {
                enabled: true,
                config: configData.config
            };

            this.showNotification(`插件 ${pluginName} 已成功应用到服务 ${service.name}`, 'success');
            
            // 关闭所有相关模态框
            $('.modal').modal('hide');
            
            // 跳转到服务管理页面
            this.loadPage('services');
            
        } catch (error) {
            console.error('应用插件到服务失败:', error);
            this.showNotification('应用插件失败', 'error');
        }
    }

    // 为消费者生成个性化插件配置
    generateConsumerPluginConfig(template) {
        const consumerUsername = document.getElementById('consumer-username').value || 'consumer';
        const baseConfig = { ...template.config };
        
        // 根据插件类型生成个性化配置
        switch (template.plugin_name) {
            case 'key-auth':
                return {
                    ...baseConfig,
                    key: this.generateRandomString(32), // 自动生成API Key
                    header: baseConfig.header || 'apikey',
                    query: baseConfig.query || 'apikey',
                    hide_credentials: baseConfig.hide_credentials || false
                };
                
            case 'basic-auth':
                return {
                    ...baseConfig,
                    username: consumerUsername,
                    password: this.generateRandomString(16) // 自动生成密码
                };
                
            case 'jwt-auth':
                return {
                    ...baseConfig,
                    secret: this.generateRandomString(32), // 自动生成密钥
                    key: baseConfig.key || 'Authorization',
                    exp: baseConfig.exp || 86400
                };
                
            case 'hmac-auth':
                return {
                    ...baseConfig,
                    access_key: `${consumerUsername}_${this.generateRandomString(8)}`,
                    secret_key: this.generateRandomString(32)
                };
                
            default:
                return baseConfig;
        }
    }

    // 应用插件到消费者
    applyPluginToConsumer(consumerId, pluginName, encodedConfigData) {
        try {
            const configData = this.safeDecode(encodedConfigData);
            if (!configData) {
                this.showNotification('插件配置数据解码失败', 'error');
                return;
            }
            
            const consumer = this.consumersData.find(c => c.id === consumerId);
            
            if (!consumer) {
                this.showNotification('消费者不存在', 'error');
                return;
            }

            // 初始化插件的plugins对象
            if (!consumer.plugins) {
                consumer.plugins = {};
            }

            // 为消费者生成个性化配置
            const personalizedConfig = this.generateConsumerPluginConfig(configData);

            // 应用插件配置
            consumer.plugins[pluginName] = personalizedConfig;

            this.showNotification(`插件 ${pluginName} 已成功应用到消费者 ${consumer.username}`, 'success');
            
            // 关闭所有相关模态框
            $('.modal').modal('hide');
            
            // 跳转到消费者管理页面
            this.loadPage('consumers');
            
        } catch (error) {
            console.error('应用插件到消费者失败:', error);
            this.showNotification('应用插件失败', 'error');
        }
    }

    // 创建新服务并应用插件
    createNewServiceWithPlugin(pluginName, encodedConfigData) {
        try {
            const configData = this.safeDecode(encodedConfigData);
            if (!configData) {
                this.showNotification('插件配置数据解码失败', 'error');
                return;
            }
            
            // 创建新服务
            const newService = {
                id: `service-${Date.now()}`,
                name: `${pluginName}服务`,
                upstream: 'upstream-001',
                status: 'enabled',
                createTime: new Date().toLocaleString('zh-CN'),
                plugins: {
                    [pluginName]: {
                        enabled: true,
                        config: configData.config
                    }
                }
            };

            // 添加到服务数据
            if (!this.servicesData) {
                this.servicesData = [];
            }
            this.servicesData.push(newService);

            this.showNotification(`新服务已创建，插件 ${pluginName} 已应用`, 'success');
            
            // 关闭所有相关模态框
            $('.modal').modal('hide');
            
            // 跳转到服务管理页面
            this.loadPage('services');
            
        } catch (error) {
            console.error('创建新服务失败:', error);
            this.showNotification('创建新服务失败', 'error');
        }
    }

    // 创建新消费者并应用插件
    createNewConsumerWithPlugin(pluginName, encodedConfigData) {
        try {
            const configData = this.safeDecode(encodedConfigData);
            if (!configData) {
                this.showNotification('插件配置数据解码失败', 'error');
                return;
            }
            
            // 创建新消费者
            const newConsumer = {
                id: `consumer-${Date.now()}`,
                username: `${pluginName}用户`,
                desc: `应用了 ${pluginName} 插件的消费者`,
                status: 'enabled',
                createTime: new Date().toLocaleString('zh-CN'),
                plugins: {
                    [pluginName]: {
                        enabled: true,
                        config: configData.config
                    }
                }
            };

            // 添加到消费者数据
            if (!this.consumersData) {
                this.consumersData = [];
            }
            this.consumersData.push(newConsumer);

            this.showNotification(`新消费者已创建，插件 ${pluginName} 已应用`, 'success');
            
            // 关闭所有相关模态框
            $('.modal').modal('hide');
            
            // 跳转到消费者管理页面
            this.loadPage('consumers');
            
        } catch (error) {
            console.error('创建新消费者失败:', error);
            this.showNotification('创建新消费者失败', 'error');
        }
    }
    
    // 刷新访问链路表格
    refreshAccessChainTable() {
        const tbody = document.getElementById('accessChainTableBody');
        if (!tbody) return;
        
        // 添加调试信息
        console.log('刷新访问链路表格 - 服务数据:', this.servicesData);
        console.log('刷新访问链路表格 - 路由数据:', this.routesData);
        console.log('刷新访问链路表格 - 消费者数据:', this.consumersData);
        
        // 收集配置数据
        const relationships = this.buildConfigRelationships();
        console.log('构建的关系数据:', relationships);
        
        const allRelationships = this.generateRelationshipRows(relationships);
        console.log('生成的关系行:', allRelationships);
        
        if (allRelationships.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        <i class="mdi mdi-information-outline me-2"></i>暂无配置关系
                    </td>
                </tr>
            `;
            return;
        }
        
        // 生成表格行
        tbody.innerHTML = allRelationships.map((row, index) => {
            console.log(`生成第${index}行数据:`, row);
            
            // 获取各组件的名称和ID
            const consumerName = row.consumer !== '-' ? this.getConsumerDisplayName(row.consumer) : '-';
            const routeName = row.route !== '-' ? this.getRouteDisplayName(row.route) : '-';
            const serviceName = row.service !== '-' ? this.getServiceDisplayName(row.service) : '-';
            const upstreamName = row.upstream !== '-' ? this.getUpstreamDisplayName(row.upstream) : '-';
            
            return `
                <tr class="border-bottom">
                    <td class="text-center">
                        <div class="d-flex flex-column align-items-center">
                            <span class="badge bg-warning mb-1">${consumerName}</span>
                            <small class="text-muted">${row.consumer || '-'}</small>
                        </div>
                    </td>
                    <td class="text-center">
                        <i class="mdi mdi-arrow-right text-muted"></i>
                    </td>
                    <td class="text-center">
                        <div class="d-flex flex-column align-items-center">
                            <span class="badge bg-info mb-1">${routeName}</span>
                            <small class="text-muted">${row.route || '-'}</small>
                        </div>
                    </td>
                    <td class="text-center">
                        <i class="mdi mdi-arrow-right text-muted"></i>
                    </td>
                    <td class="text-center">
                        <div class="d-flex flex-column align-items-center">
                            <span class="badge bg-success mb-1">${serviceName}</span>
                            <small class="text-muted">${row.service || '-'}</small>
                        </div>
                    </td>
                    <td class="text-center">
                        <i class="mdi mdi-arrow-right text-muted"></i>
                    </td>
                    <td class="text-center">
                        <div class="d-flex flex-column align-items-center">
                            <span class="badge bg-primary mb-1">${upstreamName}</span>
                            <small class="text-muted">${row.upstream || '-'}</small>
                        </div>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.apisixAdmin.showAccessChainJSON(${index})">
                            <i class="mdi mdi-code-json"></i>
                        </button>
                        <input type="hidden" id="access-chain-data-${index}" value='${JSON.stringify(row)}'>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log('表格生成完成，总行数:', allRelationships.length);
    }
    
    // 构建配置关系数据
    buildConfigRelationships() {
        const relationships = {
            upstreamToServices: {},
            serviceToRoutes: {},
            consumerToRoutes: {},
            pluginUsage: {}
        };
        
        console.log('构建关系 - 服务数据字段:', this.servicesData.map(s => ({ id: s.id, upstream: s.upstream })));
        console.log('构建关系 - 路由数据字段:', this.routesData.map(r => ({ id: r.id, service: r.service })));
        
        // 构建上游 → 服务关系
        this.servicesData.forEach(service => {
            if (service.upstream) {
                if (!relationships.upstreamToServices[service.upstream]) {
                    relationships.upstreamToServices[service.upstream] = [];
                }
                relationships.upstreamToServices[service.upstream].push(service.id);
            }
        });
        
        // 构建服务 → 路由关系
        this.routesData.forEach(route => {
            if (route.service) {
                if (!relationships.serviceToRoutes[route.service]) {
                    relationships.serviceToRoutes[route.service] = [];
                }
                relationships.serviceToRoutes[route.service].push(route.id);
            }
        });
        
        // 构建消费者 → 路由关系（如果有的话）
        this.consumersData.forEach(consumer => {
            if (consumer.routes && consumer.routes.length > 0) {
                if (!relationships.consumerToRoutes[consumer.id]) {
                    relationships.consumerToRoutes[consumer.id] = [];
                }
                relationships.consumerToRoutes[consumer.id].push(...consumer.routes);
            }
        });
        
        console.log('构建的关系结果:', relationships);
        
        // 统计插件使用情况
        const pluginCount = {};
        
        // 统计服务中的插件
        this.servicesData.forEach(service => {
            if (service.plugins) {
                Object.keys(service.plugins).forEach(pluginName => {
                    pluginCount[pluginName] = (pluginCount[pluginName] || 0) + 1;
                });
            }
        });
        
        // 统计消费者中的插件
        this.consumersData.forEach(consumer => {
            if (consumer.plugins) {
                Object.keys(consumer.plugins).forEach(pluginName => {
                    pluginCount[pluginName] = (pluginCount[pluginName] || 0) + 1;
                });
            }
        });
        
        relationships.pluginUsage = pluginCount;
        
        return relationships;
    }
    
    // 显示访问链路JSON详情
    showAccessChainJSON(index) {
        console.log('showAccessChainJSON 被调用，index:', index);
        
        const hiddenInput = document.getElementById(`access-chain-data-${index}`);
        console.log('找到的隐藏字段:', hiddenInput);
        
        if (!hiddenInput) {
            console.error('找不到访问链路数据:', index);
            this.showNotification('找不到数据', 'error');
            return;
        }
        
        try {
            const row = JSON.parse(hiddenInput.value);
            console.log('解析的访问链路数据:', row);
            
            // 构建完整的配置详情
            const fullConfig = this.buildFullChainConfig(row);
            
            // 创建JSON预览模态框
            const modalHTML = `
                <div class="modal fade" id="accessChainJSONModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header bg-info text-white">
                                <h5 class="modal-title">
                                    <i class="mdi mdi-code-json me-2"></i>访问链路完整配置详情
                                </h5>
                                <button type="button" class="btn btn-link text-white p-0" data-dismiss="modal">
                                    <i class="mdi mdi-close"></i>
                                </button>
                            </div>
                            <div class="modal-body">
                                <div class="bg-dark text-light p-3 rounded">
                                    <pre class="mb-0 text-light" style="font-size: 0.875rem; line-height: 1.5; color: #ffffff !important;"><code style="color: #ffffff !important;">${JSON.stringify(fullConfig, null, 2)}</code></pre>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            console.log('模态框HTML已创建');
            
            // 移除已存在的模态框
            const existingModal = document.getElementById('accessChainJSONModal');
            if (existingModal) {
                existingModal.remove();
                console.log('已移除旧的模态框');
            }
            
            // 添加新的模态框到页面
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            console.log('模态框已添加到页面');
            
            // 检查模态框是否成功创建
            const newModal = document.getElementById('accessChainJSONModal');
            console.log('新创建的模态框元素:', newModal);
            
            if (!newModal) {
                console.error('模态框创建失败');
                this.showNotification('模态框创建失败', 'error');
                return;
            }
            
            // 显示模态框
            try {
                const modal = new bootstrap.Modal(newModal);
                modal.show();
                console.log('模态框显示成功');
            } catch (modalError) {
                console.error('显示模态框失败:', modalError);
                // 尝试使用jQuery方式显示
                try {
                    $('#accessChainJSONModal').modal('show');
                    console.log('使用jQuery方式显示模态框成功');
                } catch (jqueryError) {
                    console.error('jQuery方式也失败:', jqueryError);
                    this.showNotification('显示模态框失败', 'error');
                }
            }
            
            // 模态框关闭后清理DOM
            newModal.addEventListener('hidden.bs.modal', function() {
                console.log('模态框关闭，清理DOM');
                this.remove();
            });
            
        } catch (error) {
            console.error('解析访问链路数据失败:', error);
            this.showNotification('解析数据失败', 'error');
        }
    }
    
    // 构建完整的链路配置
    buildFullChainConfig(row) {
        const fullConfig = {
            chain_info: {
                type: row.type,
                description: this.getChainDescription(row)
            },
            consumer: null,
            route: null,
            service: null,
            upstream: null
        };
        
        // 获取消费者完整配置
        if (row.consumer && row.consumer !== '-') {
            const consumer = this.consumersData.find(c => c.id === row.consumer);
            if (consumer) {
                fullConfig.consumer = consumer;
            }
        }
        
        // 获取路由完整配置
        if (row.route && row.route !== '-') {
            const route = this.routesData.find(r => r.id === row.route);
            if (route) {
                fullConfig.route = route;
            }
        }
        
        // 获取服务完整配置
        if (row.service && row.service !== '-') {
            const service = this.servicesData.find(s => s.id === row.service);
            if (service) {
                fullConfig.service = service;
            }
        }
        
        // 获取上游完整配置
        if (row.upstream && row.upstream !== '-') {
            const upstream = this.upstreamsData.find(u => u.id === row.upstream);
            if (upstream) {
                fullConfig.upstream = upstream;
            }
        }
        
        return fullConfig;
    }
    
    // 获取链路描述
    getChainDescription(row) {
        const parts = [];
        
        if (row.consumer && row.consumer !== '-') {
            const consumer = this.consumersData.find(c => c.id === row.consumer);
            parts.push(`消费者: ${consumer ? consumer.username : row.consumer}`);
        }
        
        if (row.route && row.route !== '-') {
            const route = this.routesData.find(r => r.id === row.route);
            parts.push(`路由: ${route ? route.uri : row.route}`);
        }
        
        if (row.service && row.service !== '-') {
            const service = this.servicesData.find(s => s.id === row.service);
            parts.push(`服务: ${service ? service.name : row.service}`);
        }
        
        if (row.upstream && row.upstream !== '-') {
            const upstream = this.upstreamsData.find(u => u.id === row.upstream);
            parts.push(`上游: ${upstream ? upstream.name : row.upstream}`);
        }
        
        return parts.join(' → ');
    }
    
    // 获取消费者显示名称
    getConsumerDisplayName(consumerId) {
        const consumer = this.consumersData.find(c => c.id === consumerId);
        if (consumer) {
            return consumer.username || consumer.id;
        }
        return consumerId;
    }
    
    // 获取路由显示名称
    getRouteDisplayName(routeId) {
        const route = this.routesData.find(r => r.id === routeId);
        if (route) {
            return route.uri || route.id;
        }
        return routeId;
    }
    
    // 获取服务显示名称
    getServiceDisplayName(serviceId) {
        const service = this.servicesData.find(s => s.id === serviceId);
        if (service) {
            return service.name || service.id;
        }
        return serviceId;
    }
    
    // 获取上游显示名称
    getUpstreamDisplayName(upstreamId) {
        const upstream = this.upstreamsData.find(u => u.id === upstreamId);
        if (upstream) {
            return upstream.name || upstream.id;
        }
        return upstreamId;
    }
    
    // 格式化消费者信息用于显示
    formatConsumerForDisplay(consumer) {
        const formatted = { ...consumer };
        
        // 确保关键字段存在
        formatted.id = formatted.id || '未知';
        formatted.username = formatted.username || '未知';
        formatted.description = formatted.description || formatted.desc || '';
        formatted.status = formatted.status || 'active';
        formatted.createTime = formatted.createTime || formatted.create_time || '未知';
        
        // 处理插件信息
        if (formatted.plugins && typeof formatted.plugins === 'object') {
            // 保持插件配置的完整性
            formatted.plugins = { ...formatted.plugins };
        } else {
            formatted.plugins = {};
        }
        
        return formatted;
    }
    
    // 渲染插件摘要信息
    renderPluginSummary(plugins) {
        if (!plugins || typeof plugins !== 'object' || Object.keys(plugins).length === 0) {
            return '<div class="text-muted">未配置认证插件</div>';
        }
        
        const pluginList = Object.keys(plugins).map(pluginName => {
            const pluginConfig = plugins[pluginName];
            let summary = '';
            
            switch (pluginName) {
                case 'key-auth':
                    const key = pluginConfig.key || '未设置';
                    const maskedKey = key.length > 8 ? 
                        key.substring(0, 8) + '****' + key.substring(key.length - 4) : 
                        key;
                    summary = `<div class="mb-2"><strong class="text-warning">${pluginName}</strong><br><small>API Key: <code>${maskedKey}</code></small></div>`;
                    break;
                    
                case 'basic-auth':
                    const username = pluginConfig.username || '未设置';
                    const password = pluginConfig.password || '未设置';
                    const maskedPassword = password.length > 4 ? 
                        password.substring(0, 2) + '****' + password.substring(password.length - 2) : 
                        password;
                    summary = `<div class="mb-2"><strong class="text-info">${pluginName}</strong><br><small>用户名: ${username}, 密码: <code>${maskedPassword}</code></small></div>`;
                    break;
                    
                case 'jwt-auth':
                    const secret = pluginConfig.secret || '未设置';
                    const maskedSecret = secret.length > 8 ? 
                        secret.substring(0, 8) + '****' + secret.substring(secret.length - 4) : 
                        secret;
                    summary = `<div class="mb-2"><strong class="text-success">${pluginName}</strong><br><small>密钥: <code>${maskedSecret}</code></small></div>`;
                    break;
                    
                case 'oauth2':
                    summary = `<div class="mb-2"><strong class="text-secondary">${pluginName}</strong><br><small>OAuth2 配置</small></div>`;
                    break;
                    
                default:
                    summary = `<div class="mb-2"><strong class="text-primary">${pluginName}</strong><br><small>自定义配置</small></div>`;
            }
            
            return summary;
        }).join('');
        
        return pluginList;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    window.apisixAdmin = new APISIXAdmin();
});


