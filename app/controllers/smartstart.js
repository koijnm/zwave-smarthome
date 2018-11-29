/**
 * @overview Handles Z-Wave SmartStart process.
 * @author Martin Vach
 */


/**
 * The controller that .
 * @class SmartStartBaseController
 */
myAppController.controller('SmartStartBaseController', function($scope, $timeout, cfg, dataFactory, dataService, _) {
	$scope.dataHolder = {
		video: {
			obj: null,
			mediaStream: null,
			supported: false,
			alert: {}
		},
		canvas: {
			gCanvas: null,
			gCtx: null,
			width: 640,
			height: 480
		},
		manual_add: false
	};

	$scope.checkWebcam = function() {
		var hasWebcam = false,
			isGetUserMediaSupported = false;

		// Older browsers might not implement mediaDevices at all, so we set an empty object first
		if (navigator.mediaDevices === undefined) {
			navigator.mediaDevices = {};
		}

		// Some browsers partially implement mediaDevices. We can't just assign an object
		// with getUserMedia as it would overwrite existing properties.
		// Here, we will just add the getUserMedia property if it's missing.
		if (navigator.mediaDevices.getUserMedia === undefined) {
			navigator.mediaDevices.getUserMedia = function(constraints) {

				// First get ahold of the legacy getUserMedia, if present
				var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

				// Some browsers just don't implement it - return a rejected promise with an error
				// to keep a consistent interface
				if (!getUserMedia) {
					return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
				}

				// Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
				return new Promise(function(resolve, reject) {
					getUserMedia.call(navigator, constraints, resolve, reject);
				});
			}
		}

		if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
			navigator.enumerateDevices = function(callback) {
				var enumerateDevices = navigator.mediaDevices.enumerateDevices();
				if (enumerateDevices && enumerateDevices.then) {
					navigator.mediaDevices.enumerateDevices().then(callback).catch(function() {
						callback([]);
					});
				} else {
					callback([]);
				}
			};
		}

		if (!navigator.enumerateDevices && window.MediaStreamTrack && window.MediaStreamTrack.getSources) {
			navigator.enumerateDevices = window.MediaStreamTrack.getSources.bind(window.MediaStreamTrack);
		}

		if (!navigator.enumerateDevices && navigator.enumerateDevices) {
			navigator.enumerateDevices = navigator.enumerateDevices.bind(navigator);
		}

		if (navigator.getUserMedia) {
			isGetUserMediaSupported = true;
		} else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
			isGetUserMediaSupported = true;
		}

		if ($scope.deviceDetector.browser == 'chrome' &&
			$scope.deviceDetector.browser_version.split(".")[0] >= 46 &&
			!/^(https:|chrome-extension:)$/g.test(location.protocol || '')) {

			if (typeof document !== 'undefined' && typeof document.domain === 'string' && document.domain.search && document.domain.search(/localhost|127.0./g) === -1) {
				isGetUserMediaSupported = false;
			}
		}

		navigator.enumerateDevices(function(devices) {
			devices.forEach(function(_device) {
				var device = {};
				for (var d in _device) {
					try {
						if (typeof _device[d] !== 'function') {
							device[d] = _device[d];
						}
					} catch (e) {}
				}

				if (device.kind === 'videoinput') {
					hasWebcam = true;
				}
			});
			if (hasWebcam && isGetUserMediaSupported) {
				$scope.dataHolder.video.supported = true;
			} else {
				$scope.dataHolder.video.alert = {
					message: $scope._t('camera_not_supported'),
					status: 'alert-warning',
					icon: 'fa-exclamation-circle'
				};
			}
		});

	};
	$scope.checkWebcam();


});

/**
 * The controller that include device with DSK.
 * @class SmartStartDskController
 */
myAppController.controller('SmartStartDskController', function($scope, $timeout, cfg, dataFactory, dataService, _) {
	$scope.dsk = {
		firmwareAlert: {},
		input: {
			dsk_1: '',
			dsk_2: '',
			dsk_3: '',
			dsk_4: '',
			dsk_5: '',
			dsk_6: '',
			dsk_7: '',
			dsk_8: ''
		},
		list: [],
		response: '',
	};
	// Copy original input values
	$scope.origInput = angular.copy($scope.dsk.input);
	/**
	 * Split string into 8 substrings and then fill DSK inputs
	 */
	$scope.fillInput = function(e) {
		var txt = e.originalEvent.clipboardData.getData('text/plain');
		if (txt) {
			angular.forEach(txt.split('-'), function(v, k) {
				$scope.dsk.input['dsk_' + (k + 1)] = v.substring(0, 5);
			});
		}

	}

	/**
	 * Check if SDK version match
	 */
	$scope.checkSdkVersion = function() {
			dataFactory.loadZwaveApiData().then(function(ZWaveAPIData) {
				var SDKMatch = dataService.compareVersion(ZWaveAPIData.controller.data.SDK.value, cfg.smart_start.required_min_sdk, '>=');
				if (!SDKMatch) {
					angular.extend(cfg.route.alert, {
						message: $scope._t('smartstart_not_supported')
					});

				}
			});
		}
		//$scope.checkSdkVersion();

	/**
	 * Add DSK
	 * @returns {undefined}
	 */
	$scope.addDskProvisioningList = function() {
		var dsk = {
			dsk: _.map($scope.dsk.input, function(v) {
				return v;
			}).join('-')
		};

		$scope.dataHolder.state = 'registering';
		$scope.toggleRowSpinner(cfg.api.add_dsk);
		dataFactory.postApi('add_dsk', dsk).then(function(response) {

			// Set state
			$scope.dsk.state = 'success-register';
			// Reset model
			$scope.dsk.input = angular.copy($scope.origInput);
			// Set response
			$scope.dsk.response = response.data[0];

		}, function(error) {
			$scope.dataHolder.state = null;
			alertify.alertError($scope._t('error_update_data'));
		}).finally(function() {
			$timeout($scope.toggleRowSpinner, 1000);
		});
	};

});

/**
 * The controller that displays DSK list.
 * @class SmartStartListController
 */
myAppController.controller('SmartStartListController', function($scope, $timeout, $filter, $q, cfg, dataFactory, expertService) {

	$scope.collection = {
		alert: {},
		all: [],
		find: {},
		deviceTypes: {},
		deviceInfos: {},
		vendors: {}
	};

	 /**
     * Load all promises
     * @returns {undefined}
     */
    $scope.allSettled = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        var promises = [
            dataFactory.xmlToJson(cfg.server_url + cfg.translations_xml_path + 'DeviceClasses.xml'),
            dataFactory.getApi('zwave_devices', '?lang=' + $scope.lang),
            dataFactory.getApi('get_dsk', null, true),
            dataFactory.getApi('zwave_vendors')
        ];

        $q.allSettled(promises).then(function (response) {
            // console.log(response)
            var deviceClassesXML = response[0],
            	devicesInfo = response[1],
            	DSKList = response[2],
            	Vendors = response[3];

            $scope.loading = false;
            // Error message
            if (deviceClassesXML.state === 'rejected') {
                angular.extend(cfg.route.alert, {message: $scope._t('failed_to_load_data')});
                return;
            }

            // Error message
            if (devicesInfo.state === 'rejected') {
                angular.extend(cfg.route.alert, {message: $scope._t('failed_to_load_data')});
                return;
            }

            // Error message
            if (DSKList.state === 'rejected') {
                angular.extend(cfg.route.alert, {message: $scope._t('failed_to_load_data')});
                return;
            }

            // Error message
            if (Vendors.state === 'rejected') {
                angular.extend(cfg.route.alert, {message: $scope._t('failed_to_load_data')});
                return;
            }
            // Success - DeviceClassesXML
            if (deviceClassesXML.state === 'fulfilled') {
               _.filter(deviceClassesXML.value.DeviceClasses.Generic, function(v) {
					$scope.collection.deviceTypes[v._id] = expertService.configGetZddxLang($filter('hasNode')(v, 'name.lang'), $scope.lang);
				});
            }

            // Success - DeviceInfos
            if(devicesInfo.state === 'fulfilled') {
            	setDeviceData(devicesInfo.value.data.data.zwave_devices);
            }

            // Success - VendorList
            if(Vendors.state === 'fulfilled') {
            	$scope.collection.vendors = Vendors.value.data.data.zwave_vendors;
            }

            // Success - DSKList
            if(DSKList.state === 'fulfilled') {
            	setDSKCollection(DSKList.value.data);
            }
        });

    };
    $scope.allSettled();

	/**
	 * Update DSK
	 * @returns {undefined}
	 */
	$scope.updateDsk = function(input) {
		input.ZW_QR_DSK = _.map(input.added.dskArray, function(v) {
			return v;
		}).join('-');
		dataFactory.postApi('update_dsk', _.omit(input, 'added')).then(function(response) {

			myCache.removeAll();
			$route.reload();

		}, function(error) {
			alertify.alertError($scope._t('error_update_data'));
		});
	};

	/**
	 * Remov a DSK item
	 * @param {object} input
	 * @param {string} message
	 * @returns {undefined}
	 */
	$scope.removeDsk = function(input, message) {
		if (!input.isSmartStart) {
			alertify.alertError($scope._t('delete_no_smartstart_warning'));
			return;
		}

		alertify.confirm(message, function() {
			dataFactory.getApi('remove_dsk', input.id, true).then(function(response) {
				var index = _.findIndex($scope.collection.all, {
					id: input.id
				});
				if (index > -1) {
					$scope.collection.all.splice(index, 1);
				}
			}, function(error) {
				alertify.alertError($scope._t('error_delete_data'));
			});
		}).setting('labels', {
            'ok': $scope._t('ok')
        });
	};

	/**
	 * set Device Info and grep necessary data
	 */
	function setDeviceData(zwave_devices) {
		_.filter(zwave_devices, function(v) {
			var parts = v.ConfigData.ProductId.split('.');
			if (parts.length > 3) {
				parts.pop();
			}

			var id = parts.join('.');
			$scope.collection.deviceInfos[id] = {
				BrandName: v.BrandName,
				Name: v.Name,
				Brandname_Image: v.Brandname_Image.split('/').pop(),
				Product_Image: v.Product_Image.split('/').pop(),
				Product_Image_remote: v.Product_Image
			}
		});
	}

	/**
	 * set DSK collection and extend data
	 */
	function setDSKCollection(dsk_list) {
			if (_.isEmpty(dsk_list)) {
				angular.extend(cfg.route.alert, {
					message: $scope._t('empty_dsk_list'),
					icon: 'fa-info-circle text-info'
				});
				return;
			}

			// Data collection
			$scope.collection.all = _.filter(dsk_list, function(v) {
				var typeId = v.DeviceTypeGenericDeviceClass;
				var pIdArray = v.PId.split('.');
				var pId = parseInt(pIdArray[0]) + '.' + parseInt(pIdArray[1]) + '.' + parseInt(pIdArray[2]);
				var vendor = _.findWhere($scope.collection.vendors, {"ManufacturerId": v.ManufacturerId});

				var brand_name,
					brand_image;

				brand_image = $scope.collection.deviceInfos[pId] ? $scope.collection.deviceInfos[pId].Brandname_Image : (vendor ? vendor.Image : '');
				brand_name = $scope.collection.deviceInfos[pId] ? $scope.collection.deviceInfos[pId].BrandName : (vendor ? vendor.Name : '-');

				// Extending an object
				v.added = {
					pId: pId,
					device_type: $scope.collection.deviceTypes[typeId] ? $scope.collection.deviceTypes[typeId] : '',
					dskArray: v.DSK.split('-'),
					timeformat: $filter('dateTimeFromTimestamp')(v.timestamp),
					product_image: $scope.collection.deviceInfos[pId] ? $scope.collection.deviceInfos[pId].Product_Image : '',
					product_image_remote: $scope.collection.deviceInfos[pId] ? $scope.collection.deviceInfos[pId].Product_Image_remote : '',
					brand_name: brand_name,
					brand_image: brand_image,
					product: $scope.collection.deviceInfos[pId] ? $scope.collection.deviceInfos[pId].Name : '-'
				};
				return v;
			});
	}
});


/**
 * The controller that include device by scanning QR code.
 * @class SmartStartQrController
 */
myAppController.controller('SmartStartQrController', function($scope, $timeout, $location, dataFactory) {
	$scope.qrcode = {
		input: {
			qrcode: ''
		},
		state: 'start',
		response: ''
	};

	/**
	 * stop video on page destroy
	 */
	$scope.$on('$destroy', function() {
		$scope.stopStream();
	});

	$scope.stopStream = function() {
		if ($scope.dataHolder.video.mediaStream !== null) {
			$scope.dataHolder.video.mediaStream.stop();
			$scope.dataHolder.video.mediaStream = null;
			$scope.dataHolder.video.obj = null;
		}
	}

	/**
	 * Callback
	 */
	$scope.callbackQrCode = function(data) {
		var index = data.indexOf(":");
		if (index !== -1) {
			data = data.substr(index + 1);
		}
		$scope.qrcode.input = data;
		var qr_code_str = {
			dsk: data
		};
		dataFactory.postApi('add_dsk', qr_code_str).then(function(response) {
			$scope.qrcode.state = 'success-register';
			$scope.stopStream();
			$scope.qrcode.response = response.data;

			$timeout(function() {
				$location.path('/smartstartlist');
			}, 1000);


		}, function(error) {
			$scope.dataHolder.state = null;
			if (error.status == 409) {
				alertify.alertError($scope._t('error_smartstart_already_exists')).set('onok', function(closeEvent) {
					captureToCanvas();
				});
			} else {
				alertify.alertError($scope._t('error_smartstart_add_dsk'));
			}
		});
	};


	/**
	 * Init QR-Code-Reader if supported
	 */
	$scope.initQRCodeReader = function() {
		if ($scope.dataHolder.video.supported) {
			var constraints = $scope.deviceDetector.isMobile() ? {
				video: {
					facingMode: "environment"
				}
			} : {
				video: true
			};

			navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
				qrcode.callback = $scope.callbackQrCode;
				$scope.dataHolder.video.obj = document.querySelector('video');
				$scope.dataHolder.video.mediaStream = stream;
				// Older browsers may not have srcObject
				if ("srcObject" in $scope.dataHolder.video) {
					$scope.dataHolder.video.obj.srcObject = stream;
				} else {
					// Avoid using this in new browsers, as it is going away.
					$scope.dataHolder.video.obj.src = window.URL.createObjectURL(stream);
				}

				$scope.dataHolder.video.mediaStream.stop = function() {
					this.getVideoTracks().forEach(function(track) {
						track.stop();
					});
				};

				$scope.dataHolder.video.obj.onloadedmetadata = function(e) {
					$scope.initCanvas();
					$scope.dataHolder.video.obj.play();
				};

				setTimeout(captureToCanvas(), 500);

			}).catch(function(err) {
				$scope.dataHolder.video.supported = false;
				console.log(err.name + ": " + err.message);
			});
		}
	};

	$scope.$watch("dataHolder.video.supported", function(newVal, oldVal) {
		if ($scope.dataHolder.video.supported) {
			$scope.initQRCodeReader();
		}
	});

	/**
	 * Init canvas to discover qrcode
	 */
	$scope.initCanvas = function() {
		$scope.dataHolder.canvas.gCanvas = document.getElementById("qr-canvas");
		$scope.dataHolder.canvas.gCanvas.style.width = $scope.dataHolder.video.obj.videoWidth + "px";
		$scope.dataHolder.canvas.gCanvas.style.height = $scope.dataHolder.video.obj.videoHeight + "px";
		$scope.dataHolder.canvas.gCanvas.width = $scope.dataHolder.video.obj.videoWidth;
		$scope.dataHolder.canvas.gCanvas.height = $scope.dataHolder.video.obj.videoHeight;
		$scope.dataHolder.canvas.gCtx = $scope.dataHolder.canvas.gCanvas.getContext("2d");
		$scope.dataHolder.canvas.gCtx.clearRect(0, 0, $scope.dataHolder.video.obj.videoWidth, $scope.dataHolder.video.obj.videoHeight);
	};

	function captureToCanvas() {
		try {
			$scope.dataHolder.canvas.gCtx.drawImage($scope.dataHolder.video.obj, 0, 0);
			qrcode.decode();
		} catch (e) {
			console.log(e);
			setTimeout(captureToCanvas, 500);
		};
	}
});